# Latest solution package

**`SL_Referrals_1_0_0_23.zip`** (unmanaged, version 1.0.0.23)

Download: <https://github.com/aritra326/SL-Referrals-POC/raw/main/solution-export/SL_Referrals_1_0_0_23.zip>
(or open the file in the repo and choose **Download raw file**). If the repository is private, sign in to GitHub first.

## What is in 1.0.0.23

| Area | Change |
|---|---|
| Cover / Section main form | Shows every column: name, cover code, product, external code, parent, is leaf, display order, status reason, effective from / to and description |
| Cover / Section views | Active, Inactive, Advanced Find, Associated and Lookup views show product, cover code and (on the full views) parent, display order, effective dates and status reason. Quick Find also searches cover code and external code |
| Referral Item main form | **Underwriter Rationale** sits directly under **Referral Details** in the "What needs approval" section of the Summary tab |
| Referral Builder | Saves the chosen approver as the item's **Assigned Approver** |
| Web resources | Page version `?v=1.0.0.21` so browsers fetch the new scripts |

## How to import

1. Power Apps > **Solutions** > **Import solution** > choose `SL_Referrals_1_0_0_23.zip` > Next > Import.
2. When it finishes, choose **Publish all customizations**.
3. Hard-refresh the app (Ctrl+F5) and open a Cover / Section and a Referral Item.

The package is **unmanaged**. A managed package can only be exported from Dataverse
(Solutions > SL Referrals > Export > Managed), so export it from the environment after importing this one.

Older packages in this folder are kept for history. `1.0.0.21` and `1.0.0.22` are superseded by `1.0.0.23`.

Rebuild it from an earlier export with `python3 sl-referrals-app/build_solution_zip.py --source <export.zip> --version <x.y.z.w>`.
