using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Moq;
using Referral.Application;
using Referral.Domain;
using Referral.Plugins;
using Xunit;

namespace Referral.Plugins.Tests
{
    /// <summary>
    /// Everything here uses mocks: it proves the entry points read inputs, check registration and translate errors
    /// correctly. It does NOT prove behaviour inside Dataverse; see docs/integration-test-plan.md for that.
    /// </summary>
    public class PluginHarness
    {
        public readonly Mock<IPluginExecutionContext> Context = new Mock<IPluginExecutionContext>();
        public readonly Mock<ITracingService> Tracing = new Mock<ITracingService>();
        public readonly Mock<IOrganizationServiceFactory> Factory = new Mock<IOrganizationServiceFactory>();
        public readonly Mock<IServiceProvider> Provider = new Mock<IServiceProvider>();
        public readonly ParameterCollection Inputs = new ParameterCollection();
        public readonly ParameterCollection Outputs = new ParameterCollection();
        public readonly List<string> Traced = new List<string>();

        public readonly Guid CallerId = Guid.NewGuid();
        public readonly Guid TargetId = Guid.NewGuid();
        public readonly Guid CorrelationId = Guid.NewGuid();

        public PluginHarness(string message, string table)
        {
            Context.SetupGet(c => c.MessageName).Returns(message);
            Context.SetupGet(c => c.Stage).Returns(LifecyclePluginBase.MainOperationStage);
            Context.SetupGet(c => c.Depth).Returns(1);
            Context.SetupGet(c => c.InitiatingUserId).Returns(CallerId);
            Context.SetupGet(c => c.CorrelationId).Returns(CorrelationId);
            Context.SetupGet(c => c.InputParameters).Returns(Inputs);
            Context.SetupGet(c => c.OutputParameters).Returns(Outputs);

            Tracing.Setup(t => t.Trace(It.IsAny<string>(), It.IsAny<object[]>())).Callback<string, object[]>((m, a) => Traced.Add(m));
            Factory.Setup(f => f.CreateOrganizationService(null)).Returns(new Mock<IOrganizationService>().Object);

            Provider.Setup(p => p.GetService(typeof(IPluginExecutionContext))).Returns(Context.Object);
            Provider.Setup(p => p.GetService(typeof(ITracingService))).Returns(Tracing.Object);
            Provider.Setup(p => p.GetService(typeof(IOrganizationServiceFactory))).Returns(Factory.Object);

            Inputs["Target"] = new EntityReference(table, TargetId);
            Inputs["ActionName"] = "Authorise";
        }
    }

    /// <summary>A plug-in that records what it was asked to do, so input parsing can be checked on its own.</summary>
    public class CapturingPlugin : LifecyclePluginBase
    {
        public PluginCall Captured;
        public Func<PluginCall, Guid> Behaviour = call => Guid.Empty;

        protected override string MessageName { get { return "test_Message"; } }
        protected override string TargetTable { get { return "slcrm_referralitem"; } }

        protected override LifecycleServices CreateServices(IOrganizationService service, ITracingService tracing)
        {
            return new LifecycleServices();
        }

        protected override Guid Run(PluginCall call, LifecycleServices services)
        {
            Captured = call;
            return Behaviour(call);
        }
    }

    /// <summary>The real item plug-in, but with a mocked repository instead of Dataverse.</summary>
    public class ItemPluginWithFakeData : ReferralItemActionPlugin
    {
        public Mock<IReferralRepository> Repository = new Mock<IReferralRepository>();
        public LifecycleSettings Settings = new LifecycleSettings { RankDirection = RankDirection.HigherNumberGreater };

        protected override LifecycleServices CreateServices(IOrganizationService service, ITracingService tracing)
        {
            var provider = new Mock<ILifecycleSettingsProvider>();
            provider.Setup(p => p.Load()).Returns(Settings);
            return new LifecycleServices
            {
                Repository = Repository.Object,
                Settings = provider.Object,
                Clock = new SystemClock(),
                Trace = new TracingServiceTrace(tracing)
            };
        }
    }

    public class RegistrationAndInputTests
    {
        private static PluginHarness ForCapturing()
        {
            return new PluginHarness("test_Message", "slcrm_referralitem");
        }

        [Fact]
        public void ARegisteredPlugin_ReadsTheTargetActionCommentCallerAndCorrelation()
        {
            PluginHarness h = ForCapturing();
            h.Inputs["Comment"] = "hello";
            var plugin = new CapturingPlugin();

            plugin.Execute(h.Provider.Object);

            Assert.Equal(h.TargetId, plugin.Captured.TargetId);
            Assert.Equal("Authorise", plugin.Captured.ActionName);
            Assert.Equal("hello", plugin.Captured.Comment);
            Assert.Equal(h.CallerId, plugin.Captured.CallerId);
            Assert.Equal(h.CorrelationId.ToString(), plugin.Captured.CorrelationId);
        }

        [Fact]
        public void TheResultIsReturnedAsResultRecordId()
        {
            PluginHarness h = ForCapturing();
            Guid result = Guid.NewGuid();
            var plugin = new CapturingPlugin { Behaviour = call => result };

            plugin.Execute(h.Provider.Object);

            Assert.Equal(result, h.Outputs[LifecyclePluginBase.ResultOutputName]);
        }

        [Fact]
        public void WritesRunAsTheSystemUser_NotAsTheCaller()
        {
            PluginHarness h = ForCapturing();

            new CapturingPlugin().Execute(h.Provider.Object);

            h.Factory.Verify(f => f.CreateOrganizationService(null), Times.Once());
            h.Factory.Verify(f => f.CreateOrganizationService(h.CallerId), Times.Never());
        }

        [Fact]
        public void TheDeployedParameterSpelling_NewAuthorityID_IsReadIgnoringCase()
        {
            PluginHarness h = ForCapturing();
            Guid authority = Guid.NewGuid();
            h.Inputs["NewAuthorityID"] = authority;
            var plugin = new CapturingPlugin();

            plugin.Execute(h.Provider.Object);

            Assert.Equal(authority, plugin.Captured.NewAuthorityId);
        }

        [Fact]
        public void AnEmptyGuid_SentByDataverseForAnOmittedOptionalParameter_IsTreatedAsNotSupplied()
        {
            PluginHarness h = ForCapturing();
            h.Inputs["NewAuthorityId"] = Guid.Empty;
            var plugin = new CapturingPlugin();

            plugin.Execute(h.Provider.Object);

            Assert.Null(plugin.Captured.NewAuthorityId);
        }

        [Fact]
        public void AnAuthorityIdSentAsText_IsAccepted()
        {
            PluginHarness h = ForCapturing();
            Guid authority = Guid.NewGuid();
            h.Inputs["NewAuthorityId"] = authority.ToString();
            var plugin = new CapturingPlugin();

            plugin.Execute(h.Provider.Object);

            Assert.Equal(authority, plugin.Captured.NewAuthorityId);
        }

        [Fact]
        public void AnAuthorityIdOfTheWrongType_IsTreatedAsNotSupplied()
        {
            PluginHarness h = ForCapturing();
            h.Inputs["NewAuthorityID"] = true;
            var plugin = new CapturingPlugin();

            plugin.Execute(h.Provider.Object);

            Assert.Null(plugin.Captured.NewAuthorityId);
        }

        [Fact]
        public void ARegistrationOnTheWrongMessage_IsRejectedWithAnExplanation()
        {
            var h = new PluginHarness("some_OtherMessage", "slcrm_referralitem");

            var error = Assert.Throws<InvalidPluginExecutionException>(() => new CapturingPlugin().Execute(h.Provider.Object));

            Assert.Contains("wrong message", error.Message);
        }

        [Fact]
        public void ARegistrationInThePreOperationStage_IsRejected()
        {
            PluginHarness h = ForCapturing();
            h.Context.SetupGet(c => c.Stage).Returns(20);

            var error = Assert.Throws<InvalidPluginExecutionException>(() => new CapturingPlugin().Execute(h.Provider.Object));

            Assert.Contains("Main Operation", error.Message);
        }

        [Fact]
        public void ADeepCallChain_IsStoppedToPreventRecursion()
        {
            PluginHarness h = ForCapturing();
            h.Context.SetupGet(c => c.Depth).Returns(LifecyclePluginBase.MaxDepth + 1);
            var plugin = new CapturingPlugin();

            Assert.Throws<InvalidPluginExecutionException>(() => plugin.Execute(h.Provider.Object));
            Assert.Null(plugin.Captured);
        }

        [Fact]
        public void ARequestWithoutATarget_IsRejected()
        {
            PluginHarness h = ForCapturing();
            h.Inputs.Remove("Target");

            Assert.Throws<InvalidPluginExecutionException>(() => new CapturingPlugin().Execute(h.Provider.Object));
        }

        [Fact]
        public void ATargetFromAnotherTable_IsRejected()
        {
            PluginHarness h = ForCapturing();
            h.Inputs["Target"] = new EntityReference("account", Guid.NewGuid());

            Assert.Throws<InvalidPluginExecutionException>(() => new CapturingPlugin().Execute(h.Provider.Object));
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("   ")]
        public void ARequestWithoutAnActionName_IsRejected(string actionName)
        {
            PluginHarness h = ForCapturing();
            h.Inputs["ActionName"] = actionName;

            Assert.Throws<InvalidPluginExecutionException>(() => new CapturingPlugin().Execute(h.Provider.Object));
        }

        [Fact]
        public void TheItemPlugin_RefusesATargetFromTheReferralTable()
        {
            var h = new PluginHarness("slcrm_ExecuteReferralItemAction", "slcrm_referralrequest");

            Assert.Throws<InvalidPluginExecutionException>(() => new ItemPluginWithFakeData().Execute(h.Provider.Object));
        }

        [Fact]
        public void TheReferralPlugin_RefusesTheItemMessage()
        {
            var h = new PluginHarness("slcrm_ExecuteReferralItemAction", "slcrm_referralrequest");

            var error = Assert.Throws<InvalidPluginExecutionException>(() => new ReferralRequestActionPlugin().Execute(h.Provider.Object));

            Assert.Contains("wrong message", error.Message);
        }
    }

    public class ErrorTranslationTests
    {
        [Fact]
        public void ABusinessRuleError_BecomesAFriendlyMessageThatKeepsTheCode()
        {
            var h = new PluginHarness("test_Message", "slcrm_referralitem");
            var plugin = new CapturingPlugin
            {
                Behaviour = call => { throw new LifecycleException(LifecycleErrorCodes.StatusConflict, "Refresh and try again."); }
            };

            var error = Assert.Throws<InvalidPluginExecutionException>(() => plugin.Execute(h.Provider.Object));

            Assert.Equal("SLR-STATUS-409: Refresh and try again.", error.Message);
            Assert.Contains(h.Traced, line => line.Contains("SLR-STATUS-409"));
        }

        [Fact]
        public void AnUnexpectedError_ShowsAGenericMessageWithTheReferenceButKeepsDetailInTheTrace()
        {
            var h = new PluginHarness("test_Message", "slcrm_referralitem");
            var plugin = new CapturingPlugin
            {
                Behaviour = call => { throw new InvalidOperationException("secret internal detail"); }
            };

            var error = Assert.Throws<InvalidPluginExecutionException>(() => plugin.Execute(h.Provider.Object));

            Assert.DoesNotContain("secret internal detail", error.Message);
            Assert.Contains(h.CorrelationId.ToString(), error.Message);
            Assert.Contains(h.Traced, line => line.Contains("secret internal detail"));
        }

        [Fact]
        public void AnInvalidPluginExecutionException_IsPassedThroughUnchanged()
        {
            var h = new PluginHarness("test_Message", "slcrm_referralitem");
            var original = new InvalidPluginExecutionException("already friendly");
            var plugin = new CapturingPlugin { Behaviour = call => { throw original; } };

            var error = Assert.Throws<InvalidPluginExecutionException>(() => plugin.Execute(h.Provider.Object));

            Assert.Same(original, error);
        }

        [Fact]
        public void WhenTheUseCaseFails_NoResultIsReturned()
        {
            var h = new PluginHarness("test_Message", "slcrm_referralitem");
            var plugin = new CapturingPlugin
            {
                Behaviour = call => { throw new LifecycleException(LifecycleErrorCodes.NotPermitted, "No."); }
            };

            Assert.Throws<InvalidPluginExecutionException>(() => plugin.Execute(h.Provider.Object));
            Assert.False(h.Outputs.Contains(LifecyclePluginBase.ResultOutputName));
        }
    }

    public class ItemPluginEndToEndWithMocksTests
    {
        private static void GiveEligibleSubmittedItem(ItemPluginWithFakeData plugin, PluginHarness h)
        {
            Guid parentId = Guid.NewGuid();
            Guid authorityId = Guid.NewGuid();
            Guid levelId = Guid.NewGuid();
            Guid productId = Guid.NewGuid();

            var item = new ItemRecord
            {
                Id = h.TargetId,
                ParentId = parentId,
                Status = ItemStatus.Submitted,
                IsCurrentRevision = true,
                AssignedApproverId = h.CallerId,
                AuthorityAssignmentId = authorityId,
                RequiredAuthorityLevelId = levelId,
                RowVersion = "7"
            };
            var parent = new ParentRecord { Id = parentId, Status = ParentStatus.SentForApproval, HasEverBeenSubmitted = true, ProductId = productId };
            var authority = new AuthorityFacts
            {
                AssignmentId = authorityId,
                ProductId = productId,
                UnderwriterId = h.CallerId,
                IsActive = true,
                StatusIsCurrent = true,
                EffectiveFrom = DateTime.UtcNow.Date.AddDays(-5),
                EffectiveTo = DateTime.UtcNow.Date.AddDays(5),
                LevelIsActive = true,
                LevelCanApproveReferrals = true,
                LevelRank = 4
            };

            plugin.Repository.Setup(r => r.GetItem(h.TargetId)).Returns(item);
            plugin.Repository.Setup(r => r.GetParent(parentId)).Returns(parent);
            plugin.Repository.Setup(r => r.GetAuthority(authorityId)).Returns(authority);
            plugin.Repository.Setup(r => r.GetAuthorityLevelRank(levelId)).Returns(4);
            plugin.Repository.Setup(r => r.GetCurrentItems(parentId)).Returns(new List<ItemRecord> { item });
        }

        [Fact]
        public void StartReview_ThroughThePlugin_UpdatesTheItemAndReturnsItsId()
        {
            var h = new PluginHarness("slcrm_ExecuteReferralItemAction", "slcrm_referralitem");
            h.Inputs["ActionName"] = "StartReview";
            var plugin = new ItemPluginWithFakeData();
            GiveEligibleSubmittedItem(plugin, h);

            plugin.Execute(h.Provider.Object);

            Assert.Equal(h.TargetId, h.Outputs[LifecyclePluginBase.ResultOutputName]);
            plugin.Repository.Verify(
                r => r.UpdateItem(It.Is<ItemUpdate>(u => u.Id == h.TargetId && u.Status == ItemStatus.InReview && u.ExpectedRowVersion == "7")),
                Times.Once());
            plugin.Repository.Verify(r => r.UpdateParent(It.IsAny<ParentUpdate>()), Times.Once());
        }

        [Fact]
        public void Authorise_ByTheWrongUser_IsRefusedAndNothingIsWritten()
        {
            var h = new PluginHarness("slcrm_ExecuteReferralItemAction", "slcrm_referralitem");
            var plugin = new ItemPluginWithFakeData();
            GiveEligibleSubmittedItem(plugin, h);
            h.Context.SetupGet(c => c.InitiatingUserId).Returns(Guid.NewGuid());

            var error = Assert.Throws<InvalidPluginExecutionException>(() => plugin.Execute(h.Provider.Object));

            Assert.StartsWith("SLR-AUTH-403", error.Message);
            plugin.Repository.Verify(r => r.CreateDecision(It.IsAny<NewDecision>()), Times.Never());
            plugin.Repository.Verify(r => r.UpdateItem(It.IsAny<ItemUpdate>()), Times.Never());
            plugin.Repository.Verify(r => r.UpdateParent(It.IsAny<ParentUpdate>()), Times.Never());
        }

        [Fact]
        public void Authorise_ThroughThePlugin_RecordsOneDecisionAndUpdatesTheItem()
        {
            var h = new PluginHarness("slcrm_ExecuteReferralItemAction", "slcrm_referralitem");
            h.Inputs["Comment"] = "Fine";
            var plugin = new ItemPluginWithFakeData();
            GiveEligibleSubmittedItem(plugin, h);

            plugin.Execute(h.Provider.Object);

            plugin.Repository.Verify(r => r.CreateDecision(It.Is<NewDecision>(d => d.DecisionType == DecisionType.Authorised && d.DecidedBy == h.CallerId)), Times.Once());
            plugin.Repository.Verify(r => r.UpdateItem(It.Is<ItemUpdate>(u => u.Status == ItemStatus.Authorised)), Times.Once());
        }

        [Fact]
        public void TheReferralPlugin_RefusesAnItemActionName_ThroughItsOwnUseCase()
        {
            var h = new PluginHarness("slcrm_ExecuteReferralRequestAction", "slcrm_referralrequest");
            h.Inputs["ActionName"] = "Authorise";
            var plugin = new RequestPluginWithFakeData();
            var parentId = h.TargetId;
            plugin.Repository.Setup(r => r.GetParent(parentId)).Returns(new ParentRecord { Id = parentId, PrimaryUnderwriterId = h.CallerId });

            var error = Assert.Throws<InvalidPluginExecutionException>(() => plugin.Execute(h.Provider.Object));

            Assert.StartsWith("SLR-VAL-ACTION", error.Message);
        }
    }

    public class RequestPluginWithFakeData : ReferralRequestActionPlugin
    {
        public Mock<IReferralRepository> Repository = new Mock<IReferralRepository>();

        protected override LifecycleServices CreateServices(IOrganizationService service, ITracingService tracing)
        {
            var provider = new Mock<ILifecycleSettingsProvider>();
            provider.Setup(p => p.Load()).Returns(new LifecycleSettings { RankDirection = RankDirection.HigherNumberGreater });
            return new LifecycleServices
            {
                Repository = Repository.Object,
                Settings = provider.Object,
                Clock = new SystemClock(),
                Trace = new TracingServiceTrace(tracing)
            };
        }
    }
}
