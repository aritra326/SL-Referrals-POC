using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Referral.Application;
using Referral.Dataverse;
using Referral.Domain;
using Xunit;

namespace Referral.Dataverse.Tests
{
    public class PocSettingsTests
    {
        private static Mock<IOrganizationService> ServiceWith(params Tuple<string, string>[] defaults)
        {
            var service = new Mock<IOrganizationService>();
            var definitions = defaults.Select(d =>
            {
                var row = new Entity("environmentvariabledefinition", Guid.NewGuid());
                row["schemaname"] = d.Item1;
                row["defaultvalue"] = d.Item2;
                return row;
            }).ToList();
            service
                .Setup(s => s.RetrieveMultiple(It.Is<QueryBase>(q => ((QueryExpression)q).EntityName == "environmentvariabledefinition")))
                .Returns(new EntityCollection(definitions));
            service
                .Setup(s => s.RetrieveMultiple(It.Is<QueryBase>(q => ((QueryExpression)q).EntityName == "environmentvariablevalue")))
                .Returns(new EntityCollection());
            return service;
        }

        [Fact]
        public void TeamRoles_AreEnforcedWhenTheVariableDoesNotExist()
        {
            Assert.True(new EnvironmentVariableSettings(ServiceWith().Object).Load().EnforceTeamRoles);
        }

        [Fact]
        public void TeamRoles_CanBeSwitchedOff()
        {
            var service = ServiceWith(Tuple.Create(Schema.Setting.EnforceTeamRoles, "false"));

            Assert.False(new EnvironmentVariableSettings(service.Object).Load().EnforceTeamRoles);
        }

        [Fact]
        public void DecisionMaintenance_IsOffByDefault_AndOnlyOnWhenExplicitlySet()
        {
            Assert.False(new EnvironmentVariableSettings(ServiceWith().Object).Load().AllowDecisionMaintenance);
            Assert.True(new EnvironmentVariableSettings(ServiceWith(Tuple.Create(Schema.Setting.AllowDecisionMaintenance, "true")).Object).Load().AllowDecisionMaintenance);
        }

        [Fact]
        public void PartialCompletion_IsOnWhenTheEnvironmentSaysTrue()
        {
            var service = ServiceWith(Tuple.Create(Schema.Setting.EnablePartialCompletion, "true"), Tuple.Create(Schema.Setting.RankDirection, "HigherNumberGreater"));

            LifecycleSettings settings = new EnvironmentVariableSettings(service.Object).Load();

            Assert.True(settings.EnablePartialCompletion);
            Assert.False(settings.EnableConditionalDecision);
            Assert.Equal(RankDirection.HigherNumberGreater, settings.RankDirection);
        }
    }

    public class PocRepositoryTests
    {
        private readonly Mock<IOrganizationService> _service = new Mock<IOrganizationService>();
        private readonly ReferralRepository _repository;

        public PocRepositoryTests()
        {
            _service
                .Setup(s => s.Execute(It.Is<OrganizationRequest>(r => IsColumn(r, Schema.Item.Table, Schema.StatusCode))))
                .Returns(new RetrieveAttributeResponse { Results = new ParameterCollection { { "AttributeMetadata", MetadataFakes.ItemStatusColumn() } } });

            var authorityStatus = new StatusAttributeMetadata
            {
                OptionSet = new OptionSetMetadata(new OptionMetadataCollection(new[] { MetadataFakes.Status(10, "Current", 0), MetadataFakes.Status(11, "Suspended", 1) }))
            };
            _service
                .Setup(s => s.Execute(It.Is<OrganizationRequest>(r => IsColumn(r, Schema.Authority.Table, Schema.StatusCode))))
                .Returns(new RetrieveAttributeResponse { Results = new ParameterCollection { { "AttributeMetadata", authorityStatus } } });

            _repository = new ReferralRepository(_service.Object, new OptionValueResolver(_service.Object));
        }

        private static bool IsColumn(OrganizationRequest request, string table, string column)
        {
            var attribute = request as RetrieveAttributeRequest;
            return attribute != null && attribute.EntityLogicalName == table && attribute.LogicalName == column;
        }

        // ---- canonical open count ----

        [Fact]
        public void TheCanonicalOpenCount_IsWritten_AndTheDeprecatedColumnStaysInStep()
        {
            Entity written = null;
            _service.Setup(s => s.Update(It.IsAny<Entity>())).Callback<Entity>(e => written = e);

            _repository.UpdateParent(new ParentUpdate { Id = Guid.NewGuid(), Counts = new ParentOutcome { TotalCount = 3, OpenCount = 2 } });

            Assert.Equal("slcrm_opencurrentitemcount", Schema.Parent.OpenItemCount);
            Assert.Equal(2, written[Schema.Parent.OpenItemCount]);
            Assert.Equal(2, written[Schema.Parent.OpenItemCountLegacy]);
        }

        // ---- canonical authority column ----

        [Fact]
        public void TheCanonicalAuthorityColumn_IsTheOneTheReferralBuilderFills()
        {
            Assert.Equal("slcrm_underwriterauthority", Schema.Item.AuthorityAssignment);
            Assert.Equal("slcrm_selectedunderwritingauthority", Schema.Item.DeprecatedSelectedAuthority);
            Assert.DoesNotContain(Schema.Item.DeprecatedSelectedAuthority, new[] { Schema.Item.AuthorityAssignment });
        }

        // ---- teams ----

        [Fact]
        public void TeamExists_LooksTheTeamUpByExactName()
        {
            QueryExpression asked = null;
            _service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Callback<QueryBase>(q => asked = (QueryExpression)q).Returns(new EntityCollection(new List<Entity> { new Entity("team") }));

            Assert.True(_repository.TeamExists("SL Referral Approvers"));
            Assert.Equal("team", asked.EntityName);
            Assert.Contains(asked.Criteria.Conditions, c => c.AttributeName == "name" && (string)c.Values[0] == "SL Referral Approvers");
        }

        [Fact]
        public void IsTeamMember_JoinsTheMembershipTableForThatUser()
        {
            QueryExpression asked = null;
            _service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Callback<QueryBase>(q => asked = (QueryExpression)q).Returns(new EntityCollection());
            var userId = Guid.NewGuid();

            Assert.False(_repository.IsTeamMember(userId, "SL Referral Requestors"));

            LinkEntity link = Assert.Single(asked.LinkEntities);
            Assert.Equal("teammembership", link.LinkToEntityName);
            Assert.Contains(link.LinkCriteria.Conditions, c => c.AttributeName == "systemuserid" && (Guid)c.Values[0] == userId);
            Assert.False(asked.ColumnSet.AllColumns);
        }

        // ---- authority facts shown in the picker, and the evidence behind decisions ----

        [Fact]
        public void GetAuthority_ReadsTheLevelIdAndTheDisplayFields()
        {
            var assignmentId = Guid.NewGuid(); var levelId = Guid.NewGuid(); var userId = Guid.NewGuid(); var productId = Guid.NewGuid();
            var assignment = new Entity(Schema.Authority.Table, assignmentId);
            assignment[Schema.StateCode] = new OptionSetValue(0);
            assignment[Schema.StatusCode] = new OptionSetValue(10);
            assignment[Schema.Authority.Name] = "Dana Lee - Marine Hull";
            assignment[Schema.Authority.Level] = new EntityReference(Schema.AuthorityLevel.Table, levelId);
            assignment[Schema.Authority.Product] = new EntityReference("slcrm_product", productId);
            assignment[Schema.Authority.Underwriter] = new EntityReference("systemuser", userId);
            assignment.FormattedValues.Add(Schema.Authority.LicenceScheme, "Lloyd's");
            assignment.FormattedValues.Add(Schema.Authority.Product, "Marine Hull");

            var level = new Entity(Schema.AuthorityLevel.Table, levelId);
            level[Schema.StateCode] = new OptionSetValue(0);
            level[Schema.AuthorityLevel.Name] = "Level 6";
            level[Schema.AuthorityLevel.Rank] = 6;
            level[Schema.AuthorityLevel.CanApprove] = true;

            var user = new Entity(Schema.SystemUser.Table, userId);
            user[Schema.SystemUser.IsDisabled] = false;
            user[Schema.SystemUser.FullName] = "Dana Lee";

            _service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns((QueryBase q) =>
            {
                string table = ((QueryExpression)q).EntityName;
                Entity row = table == Schema.Authority.Table ? assignment : table == Schema.AuthorityLevel.Table ? level : user;
                return new EntityCollection(new List<Entity> { row });
            });

            AuthorityFacts facts = _repository.GetAuthority(assignmentId);

            Assert.Equal(levelId, facts.LevelId);
            Assert.Equal("Dana Lee", facts.UnderwriterName);
            Assert.Equal("Lloyd's", facts.LicenceScheme);
            Assert.Equal("Marine Hull", facts.ProductName);
            Assert.Equal(6, facts.LevelRank);
            Assert.True(facts.LevelCanApproveReferrals);
            Assert.True(facts.StatusIsCurrent);
        }

        // ---- superseded on revision ----

        [Fact]
        public void CreateRevision_MarksTheRejectedRowSuperseded_NotCurrent_AndClearsItsKey()
        {
            var rejectedId = Guid.NewGuid();
            var source = new Entity(Schema.Item.Table, rejectedId);
            source[Schema.Item.LogicalItemId] = "ITEM-0001";
            source[Schema.Item.CurrentUniquenessKey] = "key-1";
            _service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection(new List<Entity> { source }));

            var updates = new List<Entity>();
            Entity created = null;
            _service.Setup(s => s.Update(It.IsAny<Entity>())).Callback<Entity>(e => updates.Add(e));
            _service.Setup(s => s.Create(It.IsAny<Entity>())).Callback<Entity>(e => created = e).Returns(Guid.NewGuid());
            var now = new DateTime(2026, 10, 1, 9, 0, 0, DateTimeKind.Utc);

            _repository.CreateRevision(new ItemRecord { Id = rejectedId, RevisionNumber = 1 }, now);

            Entity old = Assert.Single(updates);
            Assert.False(old.GetAttributeValue<bool>(Schema.Item.IsCurrentRevision));
            Assert.Equal(now, old.GetAttributeValue<DateTime>(Schema.Item.SupersededOn));
            Assert.Null(old[Schema.Item.CurrentUniquenessKey]);
            Assert.Equal(1, old.GetAttributeValue<OptionSetValue>(Schema.StateCode).Value);
            int supersededValue = Enumerable.Range(0, 13).Select(i => 633650000 + i).First(v => v == old.GetAttributeValue<OptionSetValue>(Schema.StatusCode).Value);
            Assert.Equal(633650000 + 12, supersededValue); // the 13th label in the fake column is "Superseded"

            Assert.True(created.GetAttributeValue<bool>(Schema.Item.IsCurrentRevision));
            Assert.Equal(2, created.GetAttributeValue<int>(Schema.Item.RevisionNumber));
        }

        [Fact]
        public void TheDecisionEvidenceColumns_AreAllProtected()
        {
            foreach (string column in new[]
            {
                Schema.Decision.DecisionBy, Schema.Decision.DecisionOn, Schema.Decision.DecisionType, Schema.Decision.Comments,
                Schema.Decision.Recommendations, Schema.Decision.RejectedReason, Schema.Decision.AuthorityUsed, Schema.Decision.AuthorityLevelUsed,
                Schema.Decision.AuthorityLevelSnapshot, Schema.Decision.AuthorityRankSnapshot, Schema.Decision.CanApproveReferralsSnapshot,
                Schema.Decision.Sequence, Schema.Decision.PreviousItemStatus, Schema.Decision.NewItemStatus
            })
            {
                Assert.Contains(column, Schema.Decision.Protected);
            }
        }
    }
}
