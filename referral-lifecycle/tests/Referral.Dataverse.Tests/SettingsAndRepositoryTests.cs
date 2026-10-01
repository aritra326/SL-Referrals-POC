using System;
using System.Collections.Generic;
using System.Linq;
using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Referral.Application;
using Referral.Dataverse;
using Referral.Domain;
using Xunit;

namespace Referral.Dataverse.Tests
{
    public class EnvironmentVariableSettingsTests
    {
        private static Mock<IOrganizationService> ServiceWith(IEnumerable<Entity> definitions, IEnumerable<Entity> values)
        {
            var service = new Mock<IOrganizationService>();
            service
                .Setup(s => s.RetrieveMultiple(It.Is<QueryBase>(q => ((QueryExpression)q).EntityName == "environmentvariabledefinition")))
                .Returns(new EntityCollection(definitions.ToList()));
            service
                .Setup(s => s.RetrieveMultiple(It.Is<QueryBase>(q => ((QueryExpression)q).EntityName == "environmentvariablevalue")))
                .Returns(new EntityCollection(values.ToList()));
            return service;
        }

        private static Entity Definition(string name, string defaultValue)
        {
            var row = new Entity("environmentvariabledefinition", Guid.NewGuid());
            row["schemaname"] = name;
            row["defaultvalue"] = defaultValue;
            return row;
        }

        private static Entity ValueFor(Entity definition, string value)
        {
            var row = new Entity("environmentvariablevalue", Guid.NewGuid());
            row["environmentvariabledefinitionid"] = new EntityReference("environmentvariabledefinition", definition.Id);
            row["value"] = value;
            return row;
        }

        [Fact]
        public void DefaultValues_AreUsedWhenNoCurrentValueIsSet()
        {
            var rank = Definition(Schema.Setting.RankDirection, "LowerNumberGreater");
            var settings = new EnvironmentVariableSettings(ServiceWith(new[] { rank }, new Entity[0]).Object).Load();

            Assert.Equal(RankDirection.LowerNumberGreater, settings.RankDirection);
        }

        [Fact]
        public void ACurrentValue_OverridesTheDefault()
        {
            var rank = Definition(Schema.Setting.RankDirection, "LowerNumberGreater");
            var partial = Definition(Schema.Setting.EnablePartialCompletion, "false");
            var service = ServiceWith(new[] { rank, partial }, new[] { ValueFor(rank, "HigherNumberGreater"), ValueFor(partial, "Yes") });

            LifecycleSettings settings = new EnvironmentVariableSettings(service.Object).Load();

            Assert.Equal(RankDirection.HigherNumberGreater, settings.RankDirection);
            Assert.True(settings.EnablePartialCompletion);
        }

        [Fact]
        public void WhenNoVariablesExist_FeaturesAreOffAndTheRankDirectionIsMissing()
        {
            LifecycleSettings settings = new EnvironmentVariableSettings(ServiceWith(new Entity[0], new Entity[0]).Object).Load();

            Assert.False(settings.EnableConditionalDecision);
            Assert.False(settings.EnablePartialCompletion);
            Assert.Null(settings.RankDirection);
        }

        [Fact]
        public void AnInvalidRankDirection_IsAConfigurationError()
        {
            var rank = Definition(Schema.Setting.RankDirection, "Sideways");
            var provider = new EnvironmentVariableSettings(ServiceWith(new[] { rank }, new Entity[0]).Object);

            Assert.Equal(LifecycleErrorCodes.RankConfiguration, Assert.Throws<LifecycleException>(() => provider.Load()).Code);
        }

        [Fact]
        public void SettingsAreReadOnlyOnce()
        {
            var service = ServiceWith(new Entity[0], new Entity[0]);
            var provider = new EnvironmentVariableSettings(service.Object);

            provider.Load();
            provider.Load();

            service.Verify(s => s.RetrieveMultiple(It.IsAny<QueryBase>()), Times.Once());
        }
    }

    public class ReferralRepositoryTests
    {
        private readonly Mock<IOrganizationService> _service = new Mock<IOrganizationService>();
        private readonly ReferralRepository _repository;

        public ReferralRepositoryTests()
        {
            var item = MetadataFakes.ItemStatusColumn();
            _service
                .Setup(s => s.Execute(It.Is<OrganizationRequest>(r => IsColumn(r, Schema.Item.Table, Schema.StatusCode))))
                .Returns(new RetrieveAttributeResponse { Results = new ParameterCollection { { "AttributeMetadata", item } } });
            _repository = new ReferralRepository(_service.Object, new OptionValueResolver(_service.Object));
        }

        private static bool IsColumn(OrganizationRequest request, string table, string column)
        {
            var attribute = request as RetrieveAttributeRequest;
            return attribute != null && attribute.EntityLogicalName == table && attribute.LogicalName == column;
        }

        [Fact]
        public void UpdateItem_WritesTheEnvironmentsStatusAndStateValues()
        {
            Entity written = null;
            _service.Setup(s => s.Update(It.IsAny<Entity>())).Callback<Entity>(e => written = e);

            _repository.UpdateItem(new ItemUpdate { Id = Guid.NewGuid(), Status = ItemStatus.Authorised });

            Assert.Equal(Schema.Item.Table, written.LogicalName);
            Assert.Equal(1, written.GetAttributeValue<OptionSetValue>(Schema.StateCode).Value);
            Assert.True(written.GetAttributeValue<OptionSetValue>(Schema.StatusCode).Value >= 633650000);
        }

        [Fact]
        public void UpdateItem_WithOnlyOneChange_DoesNotWriteAnythingElse()
        {
            Entity written = null;
            _service.Setup(s => s.Update(It.IsAny<Entity>())).Callback<Entity>(e => written = e);

            _repository.UpdateItem(new ItemUpdate { Id = Guid.NewGuid(), ReviewStartedOn = new DateTime(2026, 10, 1) });

            Assert.Equal(new[] { Schema.Item.ReviewStartedOn }, written.Attributes.Keys.ToArray());
        }

        [Fact]
        public void UpdateItem_WithARowVersion_UsesAConditionalUpdate()
        {
            UpdateRequest sent = null;
            _service
                .Setup(s => s.Execute(It.IsAny<UpdateRequest>()))
                .Callback<OrganizationRequest>(r => sent = (UpdateRequest)r)
                .Returns(new UpdateResponse());

            _repository.UpdateItem(new ItemUpdate { Id = Guid.NewGuid(), ExpectedRowVersion = "123", Status = ItemStatus.InReview });

            Assert.Equal(ConcurrencyBehavior.IfRowVersionMatches, sent.ConcurrencyBehavior);
            Assert.Equal("123", sent.Target.RowVersion);
        }

        [Fact]
        public void UpdateItem_WhenDataverseReportsAVersionMismatch_BecomesAConflictMessage()
        {
            var fault = new OrganizationServiceFault { ErrorCode = -2147088254 };
            _service
                .Setup(s => s.Execute(It.IsAny<UpdateRequest>()))
                .Throws(new FaultException<OrganizationServiceFault>(fault, "mismatch"));

            var error = Assert.Throws<LifecycleException>(
                () => _repository.UpdateItem(new ItemUpdate { Id = Guid.NewGuid(), ExpectedRowVersion = "1", Status = ItemStatus.InReview }));

            Assert.Equal(LifecycleErrorCodes.ConcurrencyConflict, error.Code);
        }

        [Fact]
        public void UpdateItem_WhenDataverseFailsForAnotherReason_TheOriginalErrorIsNotHidden()
        {
            var fault = new OrganizationServiceFault { ErrorCode = -2147220970 };
            _service
                .Setup(s => s.Execute(It.IsAny<UpdateRequest>()))
                .Throws(new FaultException<OrganizationServiceFault>(fault, "other"));

            Assert.Throws<FaultException<OrganizationServiceFault>>(
                () => _repository.UpdateItem(new ItemUpdate { Id = Guid.NewGuid(), ExpectedRowVersion = "1", Status = ItemStatus.InReview }));
        }

        [Fact]
        public void UpdateParent_WritesAllFiveCountsWhenCountsAreSupplied()
        {
            Entity written = null;
            _service.Setup(s => s.Update(It.IsAny<Entity>())).Callback<Entity>(e => written = e);

            _repository.UpdateParent(new ParentUpdate
            {
                Id = Guid.NewGuid(),
                Counts = new ParentOutcome { TotalCount = 5, OpenCount = 1, AuthorisedCount = 2, RejectedCount = 1, CancelledCount = 1 }
            });

            Assert.Equal(5, written[Schema.Parent.TotalItemCount]);
            Assert.Equal(1, written[Schema.Parent.OpenItemCount]);
            Assert.Equal(2, written[Schema.Parent.AuthorisedItemCount]);
            Assert.Equal(1, written[Schema.Parent.RejectedItemCount]);
            Assert.Equal(1, written[Schema.Parent.CancelledItemCount]);
        }

        [Fact]
        public void GetItem_ForAMissingRow_IsReportedAsNotFound()
        {
            _service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection());

            Assert.Equal(LifecycleErrorCodes.NotFound, Assert.Throws<LifecycleException>(() => _repository.GetItem(Guid.NewGuid())).Code);
        }

        [Fact]
        public void GetAuthority_ForAMissingRow_ReturnsNull()
        {
            _service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection());

            Assert.Null(_repository.GetAuthority(Guid.NewGuid()));
        }

        [Fact]
        public void GetCurrentItems_AsksOnlyForCurrentRevisionsOfThatReferral_AndOnlyTheNeededColumns()
        {
            QueryExpression asked = null;
            _service
                .Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                .Callback<QueryBase>(q => asked = (QueryExpression)q)
                .Returns(new EntityCollection());

            _repository.GetCurrentItems(Guid.NewGuid());

            Assert.False(asked.ColumnSet.AllColumns);
            Assert.Contains(asked.Criteria.Conditions, c => c.AttributeName == Schema.Item.IsCurrentRevision);
            Assert.Contains(asked.Criteria.Conditions, c => c.AttributeName == Schema.Item.Parent);
        }

        [Fact]
        public void CreateDecision_ShortensTheRecommendationsColumnButNeverTheComments()
        {
            Entity written = null;
            _service.Setup(s => s.Create(It.IsAny<Entity>())).Callback<Entity>(e => written = e).Returns(Guid.NewGuid());
            var types = new[] { MetadataFakes.Choice(633650001, "Authorised With Recommendation") };
            var column = new Microsoft.Xrm.Sdk.Metadata.PicklistAttributeMetadata
            {
                OptionSet = new Microsoft.Xrm.Sdk.Metadata.OptionSetMetadata(new Microsoft.Xrm.Sdk.Metadata.OptionMetadataCollection(types))
            };
            _service
                .Setup(s => s.Execute(It.Is<OrganizationRequest>(r => IsColumn(r, Schema.Decision.Table, Schema.Decision.DecisionType))))
                .Returns(new RetrieveAttributeResponse { Results = new ParameterCollection { { "AttributeMetadata", column } } });
            string longText = new string('r', 250);

            _repository.CreateDecision(new NewDecision
            {
                ItemId = Guid.NewGuid(),
                ParentId = Guid.NewGuid(),
                DecisionType = DecisionType.AuthorisedWithRecommendation,
                DecidedBy = Guid.NewGuid(),
                DecidedOn = DateTime.UtcNow,
                Sequence = 1,
                PreviousItemStatus = ItemStatus.Submitted,
                NewItemStatus = ItemStatus.AuthorisedWithRecommendations,
                Recommendations = longText,
                Comments = longText
            });

            Assert.Equal(Schema.Decision.RecommendationsMaxLength, written.GetAttributeValue<string>(Schema.Decision.Recommendations).Length);
            Assert.Equal(longText, written.GetAttributeValue<string>(Schema.Decision.Comments));
            Assert.Equal(633650001, written.GetAttributeValue<OptionSetValue>(Schema.Decision.DecisionType).Value);
            Assert.Equal("Submitted", written.GetAttributeValue<string>(Schema.Decision.PreviousItemStatus));
        }
    }
}
