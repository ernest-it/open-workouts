# Contributing

Thanks for helping. Bug reports, ideas and pull requests are all welcome.

## Before your first pull request: the contributor agreement

Open Workouts is licensed for non-commercial use, and the copyright holder also offers a paid hosted edition. For the project to ship your change in every edition, contributors need to agree to the terms below. **You keep the copyright in your work.**

To agree, add this line to the description of your first pull request:

> I have read the Contributor License Agreement in CONTRIBUTING.md and I agree to it for all my contributions to this project.

> **Draft:** the agreement below has not yet been reviewed by a lawyer. The copyright holder will review it before relying on it.

### Contributor License Agreement

**1. Definitions.**
- **"You"** are the person, or the legal entity on whose behalf you act, submitting a Contribution.
- **"Maintainer"** is the copyright holder named in the `Required Notice` line of the project's LICENSE file, and their successors and assignees.
- A **"Contribution"** is any code, documentation or other material you intentionally submit to the project, through a pull request, an issue, a patch or any other means.

**2. Copyright license.** You grant the Maintainer a perpetual, worldwide, non-exclusive, royalty-free, irrevocable license to use, reproduce, modify, prepare derivative works of, publicly display, publicly perform, sublicense and distribute your Contributions and derivative works of them. This includes commercial use, and distribution under the project's license or any other license terms, including proprietary ones.

**3. Patent license.** You grant the Maintainer, and everyone who receives the project from the Maintainer, a perpetual, worldwide, non-exclusive, royalty-free, irrevocable patent license to make, use, sell, offer to sell, import and otherwise transfer your Contributions. This covers only the patent claims you can license that your Contribution, alone or combined with the project, would necessarily infringe.

**4. You keep your rights.** You keep the copyright in your Contributions and may use them for any other purpose.

**5. What you confirm.**
- Each Contribution is your original work, or you have the right to submit it under these terms.
- If your employer has rights to work you create, you have permission to make the Contribution, or your employer has waived those rights.
- You will not knowingly submit material that is under a license incompatible with these terms. Copyleft licenses such as GPL or AGPL count as incompatible here, as does code copied from projects whose terms you haven't checked.

**6. No obligation.** The Maintainer doesn't have to use your Contribution. Except for the confirmations in section 5, you provide your Contributions "as is", without warranties of any kind.

## Practical guidelines

- **Run the checks before opening a pull request:** `npm run typecheck && npm test`.
- **Mobile changes:** run `cd apps/mobile && npm run typecheck`.
- **One topic per pull request.** For anything that changes the data model or the sync protocol, describe the migration story.
- **New dependencies must be under a permissive license** (MIT, ISC, BSD, Apache-2.0, or similar). GPL/AGPL/LGPL code can't be included.
- **Exercise data or media must be public domain or permissively licensed.** Note the source in the pull request.
