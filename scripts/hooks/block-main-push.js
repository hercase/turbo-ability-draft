// pre-push hook: refuse pushes that update or delete the protected branch. Changes reach it
// through pull requests only. GitHub cannot enforce this on a private repo without a paid plan.
//
// Git passes one line per ref on stdin: <local ref> <local sha> <remote ref> <remote sha>

const PROTECTED_REF = "refs/heads/main";

let input = "";
process.stdin.on("data", chunk => (input += chunk));
process.stdin.on("end", () => {
    const blocked = input
        .split(/\r?\n/)
        .map(line => line.trim().split(/\s+/)[2])
        .some(remoteRef => remoteRef === PROTECTED_REF);

    if (blocked) {
        console.error("Pushing to main is not allowed. Push a branch and open a pull request instead.");
        process.exit(1);
    }
});
