using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Referral.Domain;
using Referral.Plugins;
using Xunit;

namespace Referral.Plugins.Tests
{
    public class DecisionGuardTests
    {
        private static PluginHarness Harness(string message, bool maintenance = false, int stage = 20, string table = "slcrm_referraldecision")
        {
            var h = new PluginHarness(message, table);
            h.Context.SetupGet(c => c.Stage).Returns(stage);
            h.Context.SetupGet(c => c.PrimaryEntityName).Returns(table);
            h.Inputs.Remove("Target");
            h.Inputs.Remove("ActionName");

            var service = new Mock<IOrganizationService>();
            var definition = new Entity("environmentvariabledefinition", Guid.NewGuid());
            definition["schemaname"] = "slcrm_AllowDecisionMaintenance";
            definition["defaultvalue"] = maintenance ? "true" : "false";
            service.Setup(s => s.RetrieveMultiple(It.Is<QueryBase>(q => ((QueryExpression)q).EntityName == "environmentvariabledefinition")))
                   .Returns(new EntityCollection(new List<Entity> { definition }));
            service.Setup(s => s.RetrieveMultiple(It.Is<QueryBase>(q => ((QueryExpression)q).EntityName == "environmentvariablevalue")))
                   .Returns(new EntityCollection());
            h.Factory.Setup(f => f.CreateOrganizationService(null)).Returns(service.Object);
            return h;
        }

        private static void WithUpdate(PluginHarness h, params string[] columns)
        {
            var target = new Entity("slcrm_referraldecision", Guid.NewGuid());
            foreach (string column in columns) target[column] = "changed";
            h.Inputs["Target"] = target;
        }

        [Fact]
        public void UpdatingAnEvidenceColumn_IsRefused()
        {
            PluginHarness h = Harness("Update");
            WithUpdate(h, "slcrm_rejectedreason");

            var error = Assert.Throws<InvalidPluginExecutionException>(() => new ReferralDecisionGuardPlugin().Execute(h.Provider.Object));

            Assert.StartsWith("SLR-DECISION-IMMUTABLE", error.Message);
            Assert.Contains(h.Traced, line => line.Contains("SLR-DECISION-IMMUTABLE"));
        }

        [Fact]
        public void UpdatingOnlyUnprotectedColumns_IsAllowed()
        {
            PluginHarness h = Harness("Update");
            WithUpdate(h, "ownerid");

            new ReferralDecisionGuardPlugin().Execute(h.Provider.Object);
        }

        [Fact]
        public void Deleting_IsRefused()
        {
            PluginHarness h = Harness("Delete");

            var error = Assert.Throws<InvalidPluginExecutionException>(() => new ReferralDecisionGuardPlugin().Execute(h.Provider.Object));

            Assert.StartsWith("SLR-DECISION-IMMUTABLE", error.Message);
        }

        [Fact]
        public void TheMaintenanceSetting_IsTheOnlyExceptionAndAllowsBoth()
        {
            PluginHarness update = Harness("Update", maintenance: true);
            WithUpdate(update, "slcrm_rejectedreason");
            new ReferralDecisionGuardPlugin().Execute(update.Provider.Object);

            PluginHarness delete = Harness("Delete", maintenance: true);
            new ReferralDecisionGuardPlugin().Execute(delete.Provider.Object);
        }

        [Fact]
        public void TheMaintenanceSetting_IsReadAsTheSystemUser_NotTheCaller()
        {
            PluginHarness h = Harness("Delete");

            Assert.Throws<InvalidPluginExecutionException>(() => new ReferralDecisionGuardPlugin().Execute(h.Provider.Object));

            h.Factory.Verify(f => f.CreateOrganizationService(null), Times.Once());
            h.Factory.Verify(f => f.CreateOrganizationService(h.CallerId), Times.Never());
        }

        [Fact]
        public void ARegistrationOnAnotherTable_IsRejected()
        {
            PluginHarness h = Harness("Delete", table: "account");

            Assert.Contains("wrong table", Assert.Throws<InvalidPluginExecutionException>(() => new ReferralDecisionGuardPlugin().Execute(h.Provider.Object)).Message);
        }

        [Fact]
        public void ARegistrationOnCreate_IsRejected_BecauseCreatingDecisionsMustNeverBeBlocked()
        {
            PluginHarness h = Harness("Create");

            Assert.Contains("only handles Update and Delete", Assert.Throws<InvalidPluginExecutionException>(() => new ReferralDecisionGuardPlugin().Execute(h.Provider.Object)).Message);
        }

        [Fact]
        public void ARegistrationInThePostOperationStage_IsRejected()
        {
            PluginHarness h = Harness("Delete", stage: 40);

            Assert.Contains("Pre-Operation", Assert.Throws<InvalidPluginExecutionException>(() => new ReferralDecisionGuardPlugin().Execute(h.Provider.Object)).Message);
        }
    }
}
