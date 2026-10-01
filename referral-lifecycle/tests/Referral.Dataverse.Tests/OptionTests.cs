using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Moq;
using Referral.Dataverse;
using Referral.Domain;
using Xunit;

namespace Referral.Dataverse.Tests
{
    /// <summary>Builds the metadata responses the real environment returns, so the resolver can be tested offline.</summary>
    internal static class MetadataFakes
    {
        public static StatusOptionMetadata Status(int value, string label, int state)
        {
            return new StatusOptionMetadata { Value = value, Label = new Label(label, 1033), State = state };
        }

        public static OptionMetadata Choice(int value, string label)
        {
            return new OptionMetadata { Value = value, Label = new Label(label, 1033) };
        }

        public static Mock<IOrganizationService> ServiceReturning(string table, string column, AttributeMetadata metadata)
        {
            var service = new Mock<IOrganizationService>();
            service
                .Setup(s => s.Execute(It.Is<OrganizationRequest>(r => IsAttributeRequest(r, table, column))))
                .Returns(() => new RetrieveAttributeResponse
                {
                    Results = new ParameterCollection { { "AttributeMetadata", metadata } }
                });
            return service;
        }

        private static bool IsAttributeRequest(OrganizationRequest request, string table, string column)
        {
            var attribute = request as RetrieveAttributeRequest;
            return attribute != null && attribute.EntityLogicalName == table && attribute.LogicalName == column;
        }

        public static StatusAttributeMetadata ItemStatusColumn()
        {
            var options = OptionLabels.ItemStatus.Values
                .Select((label, index) => Status(633650000 + index, label, index < 7 ? 0 : 1))
                .ToArray();
            return new StatusAttributeMetadata { OptionSet = new OptionSetMetadata(new OptionMetadataCollection(options)) };
        }
    }

    public class OptionLabelsTests
    {
        [Fact]
        public void EveryItemStatus_HasALabel()
        {
            foreach (ItemStatus status in Enum.GetValues(typeof(ItemStatus)))
            {
                Assert.True(OptionLabels.ItemStatus.ContainsKey(status), "Missing label for " + status);
            }
        }

        [Fact]
        public void EveryParentStatus_HasALabel()
        {
            foreach (ParentStatus status in Enum.GetValues(typeof(ParentStatus)))
            {
                Assert.True(OptionLabels.ParentStatus.ContainsKey(status), "Missing label for " + status);
            }
        }

        [Fact]
        public void EveryDecisionType_HasALabel()
        {
            foreach (DecisionType type in Enum.GetValues(typeof(DecisionType)))
            {
                Assert.True(OptionLabels.DecisionType.ContainsKey(type), "Missing label for " + type);
            }
        }

        [Fact]
        public void LabelsAreUniqueWithinEachStatusColumn_SoReverseLookupIsUnambiguous()
        {
            Assert.Equal(OptionLabels.ItemStatus.Count, OptionLabels.ItemStatus.Values.Distinct(StringComparer.OrdinalIgnoreCase).Count());
            Assert.Equal(OptionLabels.ParentStatus.Count, OptionLabels.ParentStatus.Values.Distinct(StringComparer.OrdinalIgnoreCase).Count());
        }

        [Fact]
        public void ItemsAndReferralsUseTheirOwnWordingForTheSameIdea()
        {
            Assert.Equal("Submitted", OptionLabels.ItemStatus[ItemStatus.Submitted]);
            Assert.Equal("Sent for Approval", OptionLabels.ParentStatus[ParentStatus.SentForApproval]);
            Assert.Equal("Revision Draft", OptionLabels.ItemStatus[ItemStatus.RevisionDraft]);
            Assert.Equal("Revision in Progress", OptionLabels.ParentStatus[ParentStatus.RevisionInProgress]);
        }
    }

    public class OptionValueResolverTests
    {
        [Fact]
        public void ForItemStatus_ReturnsTheEnvironmentsValueAndState()
        {
            var service = MetadataFakes.ServiceReturning(Schema.Item.Table, Schema.StatusCode, MetadataFakes.ItemStatusColumn());
            var resolver = new OptionValueResolver(service.Object);

            OptionInfo draft = resolver.ForItemStatus(ItemStatus.Draft);
            OptionInfo authorised = resolver.ForItemStatus(ItemStatus.Authorised);

            Assert.Equal(633650000, draft.Value);
            Assert.Equal(0, draft.State);
            Assert.Equal(1, authorised.State);
        }

        [Fact]
        public void ToItemStatus_TurnsTheEnvironmentsValueBackIntoABusinessStatus()
        {
            var service = MetadataFakes.ServiceReturning(Schema.Item.Table, Schema.StatusCode, MetadataFakes.ItemStatusColumn());
            var resolver = new OptionValueResolver(service.Object);
            int rejectedValue = resolver.ForItemStatus(ItemStatus.Rejected).Value;

            Assert.Equal(ItemStatus.Rejected, resolver.ToItemStatus(rejectedValue));
        }

        [Fact]
        public void MetadataIsReadOnlyOncePerColumn()
        {
            var service = MetadataFakes.ServiceReturning(Schema.Item.Table, Schema.StatusCode, MetadataFakes.ItemStatusColumn());
            var resolver = new OptionValueResolver(service.Object);

            resolver.ForItemStatus(ItemStatus.Draft);
            resolver.ForItemStatus(ItemStatus.Rejected);
            resolver.ToItemStatus(633650000);

            service.Verify(s => s.Execute(It.IsAny<OrganizationRequest>()), Times.Once());
        }

        [Fact]
        public void ALabelThatNoLongerExistsInTheEnvironment_FailsLoudlyAndNamesIt()
        {
            var options = new[] { MetadataFakes.Status(1, "Draft", 0) };
            var column = new StatusAttributeMetadata { OptionSet = new OptionSetMetadata(new OptionMetadataCollection(options)) };
            var resolver = new OptionValueResolver(MetadataFakes.ServiceReturning(Schema.Item.Table, Schema.StatusCode, column).Object);

            var error = Assert.Throws<InvalidOperationException>(() => resolver.ForItemStatus(ItemStatus.Submitted));
            Assert.Contains("Submitted", error.Message);
        }

        [Fact]
        public void AStatusTheCodeDoesNotKnow_IsReportedAsAConflictNotACrash()
        {
            var options = new[] { MetadataFakes.Status(99, "Brand New Status", 0) };
            var column = new StatusAttributeMetadata { OptionSet = new OptionSetMetadata(new OptionMetadataCollection(options)) };
            var resolver = new OptionValueResolver(MetadataFakes.ServiceReturning(Schema.Item.Table, Schema.StatusCode, column).Object);

            var error = Assert.Throws<LifecycleException>(() => resolver.ToItemStatus(99));
            Assert.Equal(LifecycleErrorCodes.StatusConflict, error.Code);
        }

        [Fact]
        public void LabelsAreMatchedIgnoringCaseAndSurroundingSpaces()
        {
            var options = new[] { MetadataFakes.Status(7, "  in review ", 0) };
            var column = new StatusAttributeMetadata { OptionSet = new OptionSetMetadata(new OptionMetadataCollection(options)) };
            var resolver = new OptionValueResolver(MetadataFakes.ServiceReturning(Schema.Item.Table, Schema.StatusCode, column).Object);

            Assert.Equal(7, resolver.ForItemStatus(ItemStatus.InReview).Value);
        }

        [Fact]
        public void DecisionTypes_AreResolvedFromTheChoiceColumn()
        {
            var options = new[] { MetadataFakes.Choice(633650000, "Authorised"), MetadataFakes.Choice(633650004, "Rejected") };
            var column = new PicklistAttributeMetadata { OptionSet = new OptionSetMetadata(new OptionMetadataCollection(options)) };
            var resolver = new OptionValueResolver(MetadataFakes.ServiceReturning(Schema.Decision.Table, Schema.Decision.DecisionType, column).Object);

            Assert.Equal(633650004, resolver.ForDecisionType(DecisionType.Rejected).Value);
        }

        [Fact]
        public void AuthorityStatus_CurrentIsRecognisedAndSuspendedIsNot()
        {
            var options = new[] { MetadataFakes.Status(633650001, "Current", 0), MetadataFakes.Status(633650005, "Suspended", 1) };
            var column = new StatusAttributeMetadata { OptionSet = new OptionSetMetadata(new OptionMetadataCollection(options)) };
            var resolver = new OptionValueResolver(MetadataFakes.ServiceReturning(Schema.Authority.Table, Schema.StatusCode, column).Object);

            Assert.True(resolver.IsCurrentAuthorityStatus(633650001));
            Assert.False(resolver.IsCurrentAuthorityStatus(633650005));
        }
    }
}
