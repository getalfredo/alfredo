# Porter hosts run rootless Docker by default

The installer sets up rootless Docker under Porter's non-root service user. Porter itself uses whatever Docker socket it's given, so a rootful daemon still works when an Admin chooses it, and so do development hosts.

With a rootful daemon, access to the Docker socket is root on the host. A compromised HQ, or a Stack with host access, would then be root on every Porter host. Rootless mode reduces that to Porter's service user. It also makes ufw apply to published ports and makes Porter's service user the owner of the files that containers write.

We considered three alternatives:

- **Rootful only**, which every comparable tool uses. It's the shortest install, but it leaves root one deploy away from HQ.
- **Rootful with `userns-remap`**. Railpack builds fail under it on both documented paths, and the fix is the same opt-out that removes the protection.
- **Rootless required**, with Porter refusing a rootful daemon. It would exclude hosts that already run rootful Docker, and development hosts.

The decision rests on a [test in Ubuntu 24.04 virtual machines](https://github.com/getalfredo/alfredo/blob/research/docker-modes-test/docs/research/docker-modes-test.md). One unattended command completed the setup on a clean host and next to an existing rootful daemon, and the Proxy, compose Stacks, and Railpack builds worked.

Consequences:

- The setup needs root once: packages, a subordinate ID range, lingering, a host-wide grant to bind ports 80 to 1023, and a kernel module for real client IP addresses.
- With ufw active, the Admin has to allow ports 80 and 443.
- On a clean host, the rootful daemon stays off, so `sudo docker` doesn't work. Docker commands run as the service user.
- Rootless failures are harder to diagnose. After a failed port bind, a container can run with no network and no error, so Porter recreates the Proxy instead of restarting it.
- The claim that an escape from a container stops at the service user comes from Docker's documentation and from the observed user ID mapping. The test didn't attempt an escape.
- No comparable tool ships rootless Docker, and its network performance wasn't measured.

Agreed in [Porter privilege & blast-radius model](https://github.com/getalfredo/alfredo/issues/14); see [the spec](../spec/porter.md#docker-mode).
