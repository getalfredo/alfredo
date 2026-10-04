# Porter runs a closed catalog of operations, not scripts

Porter runs only operations from a catalog compiled into the Porter binary, each with typed arguments. HQ can't send a script or a shell command, and v1 has no "run this command on the host" operation, not even for Admins. Anything outside the catalog needs SSH or a new Porter release.

The alternative was to let HQ send arbitrary scripts, as SSH-based tools such as Coolify and Kamal effectively do. Scripts would keep Porter small and let HQ add behavior without a Porter release. We rejected them because Porter would then be a remote shell: every protocol bug, replayed message, or confused request would be arbitrary code on the host, and nobody could list what Porter is able to do.

The catalog has a limit that this decision doesn't remove. A compose file, an image build, and the release command are arbitrary code that runs under Docker, so a hostile HQ can still run code on a Porter host through a deploy. The catalog bounds what a Porter bug can do and makes Porter's abilities reviewable. It doesn't defend against a compromised HQ. See the [accepted risk](../spec/porter.md#accepted-risk).

Host-changing features, such as firewall and SSH management, arrive later as new typed operations that a separate privileged helper runs. They don't arrive as a shell operation.

Agreed in [Porter privilege & blast-radius model](https://github.com/getalfredo/alfredo/issues/14); see [the spec](../spec/porter.md#operation-catalog).
