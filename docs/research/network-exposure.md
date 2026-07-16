# Network exposure primitives for HQ↔Porter

How should a Porter be reachable by HQ, and by nothing else? This document surveys the network-layer primitives available to a self-hosted, single-operator setup — Hetzner private networks and vSwitch, Hetzner Cloud Firewall, Cloudflare Tunnel, Cloudflare WARP/Mesh, Tailscale, Headscale, plain WireGuard, and plain TLS/mTLS on a public port — plus the NAT and dial-direction constraints that force some of these choices. It exists to let [#5 (Porter contract & security model)](https://github.com/getalfredo/alfredo/issues/5) pick transport and exposure with facts. It builds on [worker-agent-patterns.md](./worker-agent-patterns.md) (#2), whose shortlist was: typed-RPC agent over one keypair-pinned WSS with both dial directions.

For each primitive: what it buys, what it costs to operate, what it assumes about where Porters live, and its failure mode when the primitive itself is down.

Citation convention: every claim links to the vendor doc, RFC, or source that owns it. Claims that are logical consequences rather than direct quotes are marked *(inferred)*. Claims a primary source would not confirm are marked **unverified**. Sources fetched 2026-07-16.

---

## 1. Hetzner Cloud Private Networks

**What it buys.** Layer-3 private links between Cloud servers, each server getting a private IP not reachable from the internet, on any RFC1918 range (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) ([Networks overview](https://docs.hetzner.com/networking/networks/overview/), [Creating a Network](https://docs.hetzner.com/networking/networks/getting-started/creating-a-network/)). Free — both the network and the traffic on it ([overview](https://docs.hetzner.com/networking/networks/overview/)).

**Two facts that decide the matter.** Hetzner states plainly:

> "Traffic between cloud servers inside a Network is private and isolated, but **not automatically encrypted**. We recommend you use TLS or similar protocols to encrypt sensitive traffic." ([Networks FAQ](https://docs.hetzner.com/networking/networks/faq/))

And, on whether Cloud Firewalls protect private networks:

> "**Not yet, because we consider the private networks to be 'secure'.**" ([Firewalls FAQ](https://docs.hetzner.com/cloud/firewalls/faq/))

So a private network is neither encrypted nor firewalled. It is a *broadcast-domain-shaped trust assumption* inherited from the vendor, and Hetzner is candid that it is exactly that. Anything on that network — any other server in the project, any compromised neighbour of ours — reaches Porter's private IP unfiltered by Hetzner's own firewall product, and reads the traffic if it can observe it.

**What it assumes about where Porters live.** Hetzner, same network zone, same project. All subnets/locations in a Network must be in one **network zone**; Networks cannot span zones ([FAQ](https://docs.hetzner.com/networking/networks/faq/)). Zones are eu-central, us-east (ash), us-west (hil), ap-southeast (sin) ([Locations](https://docs.hetzner.com/cloud/general/locations/)). Non-Hetzner machines — a home NAT box, another cloud — **cannot join** ([FAQ](https://docs.hetzner.com/networking/networks/faq/)). Dedicated/Robot servers can only be bridged via vSwitch coupling, documented as restricted to `eu-central` ([Connect Dedicated Servers](https://docs.hetzner.com/networking/networks/connect-dedi-vswitch/)). Limits: 50 subnets, 100 routes, 100 attached resources per network; a server joins at most 3 networks ([overview](https://docs.hetzner.com/networking/networks/overview/)). Private-interface MTU is **1450** vs 1500 public; mismatched MTU means silently dropped packets when a host cannot fragment ([Architecture](https://docs.hetzner.com/networking/networks/technical-concepts/architecture/)).

**Failure mode.** No Networks-specific SLA document found (**unverified**). Cloud Servers carry 99.9% monthly availability ([SLA](https://docs.hetzner.com/general/company-and-policy/slas-cloud/)). What happens to private-network routes during a Hetzner-side outage is **unverified** — undocumented.

**Verdict.** Useful as a *performance and cost* optimization (free intra-zone traffic), never as a security boundary. It does not remove the need for encryption or authentication; Hetzner says so itself.

## 2. Hetzner vSwitch

**What it buys.** A layer-2 VLAN across dedicated (Robot) servers, spanning Hetzner locations, on the server's existing NIC ([vSwitch](https://docs.hetzner.com/robot/dedicated-server/network/vswitch/)). VLAN IDs 4000–4091, up to 100 servers per vSwitch, 5 vSwitches per server, **MTU must be limited to 1400** ([vSwitch](https://docs.hetzner.com/robot/dedicated-server/network/vswitch/)). Bridges Cloud↔dedicated: "This will enable cloud and dedicated root servers to reach each other via their private network links" — 1 vSwitch coupling per Cloud Network, dedicated servers cannot act as the network's router, `eu-central` only ([Connect Dedicated Servers](https://docs.hetzner.com/networking/networks/connect-dedi-vswitch/)).

**Cost.** vSwitch itself and internal traffic free; only outgoing public-subnet traffic metered (1 TB/mo included, then €1.00/TB excl. VAT) ([vSwitch](https://docs.hetzner.com/robot/dedicated-server/network/vswitch/)).

**Encryption.** No statement anywhere in the vSwitch docs — **unverified**; treat as unencrypted, as with Cloud Networks.

**External connectivity (BGP / point-to-point to on-prem).** Not documented — **unverified / no evidence found**. Appears Hetzner-internal only.

**Verdict.** Same shape as §1 with a narrower audience and an even lower MTU. Irrelevant to v1: it solves cloud↔dedicated bridging, a problem Alfredo does not have.

## 3. Hetzner Cloud Firewall

**What it buys.** A **stateful** firewall — "our Cloud Firewalls are stateful and track individual network connections and their states to and from your server" — so replies to server-initiated outbound traffic are auto-permitted ([Firewalls FAQ](https://docs.hetzner.com/cloud/firewalls/faq/)). Filters inbound and outbound ([overview](https://docs.hetzner.com/cloud/firewalls/overview/)). Default policy: "If you do not set any rule, all inbound traffic will automatically be blocked and all outbound traffic will automatically be permitted" ([overview](https://docs.hetzner.com/cloud/firewalls/overview/)). Free ([overview](https://docs.hetzner.com/cloud/firewalls/overview/)).

**Scoping.** By direct assignment to servers in the project, or via **label selectors** that auto-attach to matching servers. Rules match IP/CIDR; protocols TCP, UDP, ICMP, ESP, GRE ([FAQ](https://docs.hetzner.com/cloud/firewalls/faq/), [Creating a Firewall](https://docs.hetzner.com/cloud/firewalls/getting-started/creating-a-firewall/)). Limits: 5 firewalls/server, 50/project, 500 effective rules/firewall, 80,000 concurrent connections and 10,000 new conn/s per server ([FAQ](https://docs.hetzner.com/cloud/firewalls/faq/)).

**The interaction the ticket asks about: no stable HQ source IP.** Cloud Firewall's only ingress selector is source IP/CIDR. This is fine when HQ is a VPS with a static address — `allow TCP/<porter-port> from <HQ-IP>/32` is a genuinely strong, free control. It is **useless the moment HQ is not stably addressed**: HQ on a laptop, on a residential dynamic IP, or behind CGNAT has no `/32` to allowlist, and the only expressible rule degrades to `0.0.0.0/0` — i.e. no ingress control at all. There is no identity-, token-, or label-based ingress selector for external clients. Note the asymmetry: label selectors scope *which servers a firewall applies to*, not *which clients may connect*. So the firewall is a strong control exactly when Porter's placement is boring, and no control when it isn't — which means the security model cannot rest on it *(inferred from the IP-only rule model in the [FAQ](https://docs.hetzner.com/cloud/firewalls/faq/))*.

**Two further limits.**
- **Public interface only.** It does not filter private-network traffic ([FAQ](https://docs.hetzner.com/cloud/firewalls/faq/), quoted in §1). If Porter binds a private IP, this product protects nothing.
- **No SLA.** Hetzner's Cloud/vServer legal terms exclude "firewalls and load balancers" from the SLA by name ([Cloud/vServer terms](https://www.hetzner.com/legal/cloud-server/)). Hetzner makes *no uptime commitment* on the firewall.

**Enforcement location** (hypervisor vs guest) is **unverified** — implied by "traffic will be dropped" language, never stated. **Fail-open vs fail-closed if the API is down** is **unverified** — undocumented.

**Failure mode on rule change.** Documented and pleasant: "the new settings apply only to new connection attempts. Existing connections established before the Firewall was updated will remain active" ([FAQ](https://docs.hetzner.com/cloud/firewalls/faq/)). Tightening a rule does not tear down a live HQ↔Porter connection — but note the flip side: it does not *evict an attacker's* live connection either.

**Verdict.** Free, stateful, well-documented defense-in-depth. Keep it. But an unSLA'd, public-interface-only, source-IP-only filter is a second lock, not the lock.

## 4. Cloudflare Tunnel (`cloudflared`)

**What it buys.** Genuine outbound-only reachability: "cloudflared initiates an outbound connection through your firewall from the origin to the Cloudflare global network" ([Tunnel overview](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/)), creating a tunnel "without the need for opening any public inbound ports" ([same](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/)). Egress needs **port 7844** (UDP for `quic`, TCP for `http2`), optionally 443 for update checks/JWT validation — "Failure to allow these connections may prompt a log error, but cloudflared will still run correctly" ([Tunnel with firewall](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-with-firewall/)). You can then "block all inbound traffic, effectively blocking access to your origin from anything other than Cloudflare" ([same](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-with-firewall/)).

**Does HQ→Porter request/response fit its model?** Yes, mechanically. WebSockets are proxied "without additional configuration" on all plans ([WebSockets](https://developers.cloudflare.com/network/websockets/)), and Tunnel streams TCP/SSH/RDP/SMB over a WebSocket ([Protocols](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/protocols/)). But: "Cloudflare will close a WebSocket connection when no data is transmitted in either direction for a period of time" — mitigated by client-side ping/pong, and **only Enterprise can configure a custom idle timeout** ([WebSockets](https://developers.cloudflare.com/network/websockets/)). A documented ~8-hour cap on long-lived sessions surfaced via search but not a verbatim page fetch — **partially verified**.

**What it costs to operate.**
- **A `cloudflared` daemon per host** — a second binary next to Porter, defeating part of the single-binary story. (Multiple *replicas of the same tunnel* are supported for HA, 25 max ([Tunnel availability](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-availability/)) — that is redundancy for one origin, not per-Porter isolation.)
- **Cloudflare account coupling.** An account is required ([Get started](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/)). A domain on Cloudflare nameservers is *not* strictly required — "Partial Setup" works with a CNAME at your current DNS provider ([Tunnels FAQ](https://developers.cloudflare.com/cloudflare-one/faq/cloudflare-tunnels-faq/)). Account-less Quick Tunnels (TryCloudflare) exist but are capped at **200 concurrent requests** (HTTP 429 beyond), have **no SSE support**, and are "intended for testing and development only" ([Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)).
- **Tunnel tokens are bearer credentials**: a remotely-managed tunnel "only requires a token to run. Anyone with the token can run the tunnel" ([Tunnel tokens](https://developers.cloudflare.com/tunnel/advanced/tunnel-tokens/)).
- **Auto-update by default**: cloudflared "will periodically check for updates and restart with the new version" (24 h default, `--no-autoupdate` to disable, ignored for package-manager installs) ([Run parameters](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/run-parameters/)). An unattended third-party binary that restarts itself under our agent is a real operational property to accept deliberately, not by default.
- **Limits**: 1,000 tunnels and 1,000 routes per account; 50 service tokens ([Account limits](https://developers.cloudflare.com/cloudflare-one/account-limits/)).

**Traffic transits Cloudflare.** "all traffic to your origins flows through Cloudflare — where CDN caching, WAF, Bot Management, and DDoS protection are applied automatically" ([Tunnel overview](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/)). Applying a WAF to a stream necessarily means terminating and reading it. No primary doc states "Cloudflare can read your plaintext" verbatim — the two-hop terminating-proxy architecture makes it so *(inferred; **verbatim confirmation absent**)*. The FAQ's "No. When using Cloudflare Tunnel, all requests to the origin are made internally between cloudflared and the origin" ([FAQ](https://developers.cloudflare.com/cloudflare-one/faq/cloudflare-tunnels-faq/)) answers a *narrower* question and should not be misread as an end-to-end-encryption claim. For Alfredo this is survivable only because we would pin keys *inside* the tunnel — the payload stays opaque to Cloudflare regardless *(inferred)*.

**Access in front of it.** Service tokens (`CF-Access-Client-Id`/`CF-Access-Client-Secret` → scoped JWT) ([Service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/)) and mTLS ([Mutual TLS](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/mutual-tls-authentication/)) — the mTLS plan-tier gate is ambiguous: docs are silent, secondary sources claim Enterprise-only (**unverified**).

**Failure mode.** Normal operation is genuinely resilient: four outbound connections to four servers "spread across at least two distinct data centers... in event a single connection, server, or data center goes offline, your resources will remain available" ([Tunnel availability](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-availability/)). But a Cloudflare-side global outage severs every Porter at once, since the tunnel is wholly dependent on reaching Cloudflare's edge *(inferred — Cloudflare does not document its own outage blast radius; **unverified**)*. That is a total-fleet correlated failure introduced by choice.

**Verdict.** Excellent product, aimed at a problem we do not have. See §9.

## 5. Cloudflare WARP / Mesh (Zero Trust)

**What it buys.** Flat private addressing between enrolled machines — "devices and servers can reach each other by private IP", each device getting "its own Mesh IP" from CGNAT space `100.96.0.0/12` ([Cloudflare Mesh](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-mesh/get-started/)). Unlike Tunnel's one-directional "North-South" model, WARP-to-WARP is "private to private... (i.e. East-West)" and bidirectional, "available on all plans at no additional cost" ([Cloudflare blog: WARP-to-WARP](https://blog.cloudflare.com/warp-to-warp/)).

**What it costs to operate.** A Zero Trust org, device enrollment policies, and the WARP client on every host. Headless Linux works via **service token** enrollment — "Fully automated deployments rely on a service token to enroll the Cloudflare One Client in your Zero Trust organization" — at the documented cost that "identity-based policies and logging will be unavailable", devices landing under a synthetic `non_identity@<team-name>.cloudflareaccess.com` account ([Headless Linux](https://developers.cloudflare.com/cloudflare-one/tutorials/warp-on-headless-linux/)). Mesh nodes must run in "Traffic and DNS" mode with Gateway proxy and kernel IP forwarding enabled ([Mesh](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-mesh/get-started/)). Shares the 1,000-route account limit with Tunnel ([Account limits](https://developers.cloudflare.com/cloudflare-one/account-limits/)). Zero Trust free-tier user figures (≈50 users) came from search snippets, not a rendered primary table — **unverified**.

**The trust-surface objection.** Mesh's default posture is any-enrolled-device-reaches-any-other, subject to Gateway policy layered on top. Our requirement is the opposite and much narrower: *HQ reaches Porter, nothing else does*. Mesh grants strictly more connectivity than we want and asks us to claw it back with policy ([blog](https://blog.cloudflare.com/warp-to-warp/), [Mesh docs](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-mesh/get-started/)) *(inferred)*.

**Failure mode.** Inter-device traffic is proxied via Cloudflare, so a Cloudflare outage severs Mesh connectivity fleet-wide *(inferred; **unverified** — undocumented)*.

**Verdict.** The heaviest control plane surveyed, granting more reach than the requirement, in exchange for a dependency on a Zero Trust org *and* an IdP. Hard no for v1.

## 6. Tailscale (and Headscale)

**What it buys.** WireGuard data plane, plus a coordination server that distributes public keys, distributes ACL policy (enforced locally, deny-by-default, directional), and brokers NAT traversal as "a shared drop box for public keys" ([kb/1091](https://tailscale.com/kb/1091/what-happens-if-the-coordination-server-is-down), [ACLs](https://tailscale.com/docs/features/access-control/acls), [How Tailscale works](https://tailscale.com/blog/how-tailscale-works)). Works behind home NAT and CGNAT; falls back direct → peer relay → DERP ([DERP servers](https://tailscale.com/docs/reference/derp-servers), [Peer Relays](https://tailscale.com/docs/features/peer-relay)). DERP cannot read traffic: "Because Tailscale private keys never leave the local device that generated them, it's impossible for a DERP server to decrypt your traffic" ([DERP servers](https://tailscale.com/docs/reference/derp-servers)) — a materially better privacy posture than Cloudflare Tunnel. Addresses from `100.64.0.0/10`, MagicDNS at 100.100.100.100 ([100.x addresses](https://tailscale.com/kb/1015/100.x-addresses), [MagicDNS](https://tailscale.com/kb/1081/magicdns)).

**Failure mode — the good news.** "Tailscale does not route any traffic through the coordination server", and if it goes down: existing direct *and* DERP-relayed connections keep working, and locally-cached firewall rules keep being enforced. What breaks: no new devices, no key refresh/exchange ("existing devices will gradually lose access to each other" as node keys expire), no ACL updates, **and no key revocation** ([kb/1091](https://tailscale.com/kb/1091/what-happens-if-the-coordination-server-is-down)). Node keys default to **180 days**, configurable 1–180 or disable-able per device on all plans, with Tailscale explicitly recommending disabling expiry for "trusted servers, subnet routers, or remote IoT devices that are hard to reach" ([Key expiry](https://tailscale.com/docs/features/access-control/key-expiry)). Note the sting for a security model: during an outage you cannot revoke a compromised Porter.

**What it costs to operate.** A third-party control plane that sees device/user metadata, plus a **mandatory third-party IdP** — Tailscale is not an identity provider and offers no username/password signup; login is via Google, Microsoft, GitHub, Okta, OneLogin, Apple, or custom OIDC ([Supported SSO IdPs](https://tailscale.com/docs/integrations/identity)). For a product whose selling point is *self-hosted, single-operator*, that is two new external dependencies and a second identity system beside HQ's existing auth/2FA.

**Pricing.** Free Personal: up to 6 users, **unlimited devices per user**, 50 tagged devices included, Tailnet Lock included ([pricing](https://tailscale.com/pricing)). A solo operator with N servers fits the free tier entirely — devices are unlimited on every plan.

**Headless & Go-native.** Auth keys for non-interactive `tailscale up --auth-key=...` ([Auth keys](https://tailscale.com/kb/1085/auth-keys)); ephemeral nodes ([Ephemeral nodes](https://tailscale.com/kb/1111/ephemeral-nodes)); userspace networking without `/dev/net/tun` or CAP_NET_ADMIN ([Userspace networking](https://tailscale.com/kb/1112/userspace-networking)). Most interesting for us: **`tsnet`** embeds a full Tailscale node *inside a Go process* — no separate `tailscaled`, no root, no host TUN config, state in a directory we control ([tsnet](https://tailscale.com/kb/1244/tsnet), [pkg.go.dev/tailscale.com/tsnet](https://pkg.go.dev/tailscale.com/tsnet)). Porter is a Go binary; this is the one overlay that does not cost us a second daemon.

**Headscale.** Self-hosted control server ([repo](https://github.com/juanfont/headscale)), but: "This project is not associated with Tailscale Inc.", built by reverse-engineering the control protocol, single-tailnet only, positioned for "personal use, or a small open-source organisation", explicitly "not optimized for scale", and warns that running Headscale on a machine inside its own tailnet "can cause problems with subnet routers, traffic relay nodes, and MagicDNS" ([FAQ](https://github.com/juanfont/headscale/blob/main/docs/about/faq.md)). It removes the SaaS dependency by making us operate a reverse-engineered control plane whose uptime is now our problem — and whose compatibility moves whenever Tailscale's client does.

**Verdict.** The best-engineered overlay here, and the only one with a credible single-binary story (`tsnet`). Still: for v1 it buys NAT traversal we can get for free (§9) at the price of a SaaS + IdP dependency. Right answer to a question v1 should not be asking yet — but the right *first upgrade* (§11).

## 7. Plain WireGuard

**What it buys.** In-kernel, fast, free, no account, no third party. "Cryptokey routing": the `AllowedIPs` list "behaves as a sort of routing table" when sending and "a sort of access control list" when receiving — routing and ACL in one field, bound to a peer's public key ([wireguard.com](https://www.wireguard.com/)). The trust model is explicitly SSH-shaped: "both parties have each other's public keys, and then they're simply able to begin exchanging packets" ([wireguard.com](https://www.wireguard.com/)). In-tree since Linux 5.6 *(the install page's "kernels < 5.6" guidance implies this; the exact merge-version wording is **unverified** against wireguard.com)* ([install](https://www.wireguard.com/install/)).

**No NAT traversal — confirmed.** WireGuard has roaming, not hole-punching: "Both client and server send encrypted data to the most recent IP endpoint for which they authentically decrypted data. Thus, there is full IP roaming on both ends" ([wireguard.com](https://www.wireguard.com/)). That updates an endpoint *after* an authenticated packet arrives; it does not discover a peer. The config surface is a static `Endpoint = host:port` plus `PersistentKeepalive` (~25 s) to hold a NAT mapping open ([wg(8)](https://git.zx2c4.com/wireguard-tools/about/src/man/wg.8), [wg-quick(8)](https://git.zx2c4.com/wireguard-tools/about/src/man/wg-quick.8)). **At least one side must have a stable, publicly reachable endpoint.** If both HQ and Porter are behind NAT, plain WireGuard cannot connect them at all — that must be solved out of band.

**What it costs to operate.** "All issues of key distribution and pushed configurations are out of scope of WireGuard; these are issues much better left for other layers" ([wireguard.com](https://www.wireguard.com/)). So we own key distribution, IP allocation, and peer config. Hub-and-spoke (HQ hub, N Porters) is O(n) config; full mesh is O(n²) *(inferred from the static peer-list format — not stated as such by wireguard.com)*.

**Failure mode.** There is no control plane, so nothing to be "down" beyond the link itself — the smallest failure surface of any primitive here. In exchange: no key rotation or revocation mechanism, no expiry, and a peer's key or listener-IP change must be hand-propagated to every peer that references it *(inferred from the documented out-of-scope stance)*.

**Verdict.** Philosophically the closest match to Alfredo's instincts — no third party, keys as files, no control plane. But it delivers *the same property our app layer already delivers* (mutual static-public-key authentication), while adding per-peer config we must distribute ourselves, and it still cannot solve the both-sides-NAT case. Encryption twice, identity twice. See §10.

`wireguard-go` is the official Go userspace implementation ([git.zx2c4.com/wireguard-go](https://git.zx2c4.com/wireguard-go), [repositories](https://www.wireguard.com/repositories/)), but it is a full peer, not a lightweight join-as-a-library client — there is no `tsnet` equivalent.

## 8. Plain TLS/mTLS on a public port

**What the exposed port actually leaks.** With TLS 1.3, an attacker scanning the port learns: TLS is here, the negotiated version/ciphers, the SNI value, and that a client certificate is requested. `server_name` appears in the ClientHello ([RFC 8446 §4.2](https://www.rfc-editor.org/rfc/rfc8446.html)) — i.e. before handshake keys exist, hence cleartext. This is now addressed by **ECH, published as a full Standards Track RFC** — RFC 9849 (2026), which names the problem: "The plaintext Server Name Indication (SNI) extension in ClientHello messages, which leaks the target domain for a given connection, is perhaps the most sensitive information left unencrypted in TLS 1.3" ([RFC 9849](https://www.rfc-editor.org/rfc/rfc9849.html), bootstrapping via [RFC 9848](https://datatracker.ietf.org/doc/rfc9848/)). Porter dialed by IP with a pinned key need not send SNI at all *(inferred)*.

**A genuine TLS 1.3 privacy win.** The client's `Certificate` and `CertificateVerify` are sent *encrypted*: RFC 8446's Figure 1 wraps them in `{}`, defined as "Indicates messages protected using keys derived from a [sender]_handshake_traffic_secret" ([RFC 8446 §2](https://www.rfc-editor.org/rfc/rfc8446.html)). Unlike TLS 1.2, a passive observer does not learn which client identity connected.

**Does keypair pinning (per #2) make the exposed port a non-issue?** Substantially, yes — with one correction to the framing. A port that terminates TLS and rejects every peer whose static public key isn't pinned exposes: (a) the fact that a service exists, (b) a pre-auth TLS-handshake parser, (c) a DoS target. It does *not* expose any RPC surface, and no credential is guessable — an attacker without the private key cannot reach the first byte of application protocol. That is a small, well-understood attack surface of exactly the same shape the internet already points at every `sshd`. So: pinning makes exposure *acceptable*, not *nonexistent*; (a)–(c) are why the host firewall in §12 still earns its place.

**Go can do this cleanly.** `tls.RequireAndVerifyClientCert` "indicates that a client certificate should be requested during the handshake, and that at least one valid certificate is required to be sent by the client"; `ClientCAs` sets the roots; and `VerifyPeerCertificate` is the sanctioned custom-verification hook. Go's own docs point at the pattern for pinning: `InsecureSkipVerify` "should be used only for testing or in combination with VerifyConnection or VerifyPeerCertificate" ([pkg.go.dev/crypto/tls](https://pkg.go.dev/crypto/tls)). A private CA works via `ClientCAs`/`RootCAs`. RFC 7250 Raw Public Keys ([RFC 7250](https://www.rfc-editor.org/rfc/rfc7250.html)) would be the elegant "no X.509 at all" route, but is **not supported by Go's crypto/tls** — confirmed by absence from the package docs; no explicit Go-team statement of non-support (high confidence, not RFC-certain).

**The Bun constraint — the most load-bearing finding in this document.** HQ is the Bun binary, and if Porters dial in, HQ is the side that must *require and verify* client certificates. Bun documents the API — `Bun.serve`'s `TLSOptions.requestCert` ("If set to true, the server will request a client certificate. Default is false") and `rejectUnauthorized` ([Bun TLSOptions](https://bun.com/reference/bun/TLSOptions)) — but there are **open, unresolved bug reports that these do not take effect**: "It doesn't matter if I set the rejectUnauthorized property to false, it will always use the value of the `$NODE_TLS_REJECT_UNAUTHORIZED` environment variable" ([oven-sh/bun#22870](https://github.com/oven-sh/bun/issues/22870), Bun 1.2.22, open, no maintainer response), and "It seems requestCert and rejectUnauthorized takes no effective[sic] at all in bun" ([oven-sh/bun discussion#11587](https://github.com/oven-sh/bun/discussions/11587)). Bun as a TLS *client* is documented and uncontradicted: `fetch` takes `tls: { key, cert }` plus `checkServerIdentity` ([bun.sh/docs/api/fetch](https://bun.sh/docs/api/fetch)), and Bun's WebSocket client "Supports full TLS configuration including custom CA certificates, client certificates, and other TLS settings (same as fetch)" ([WebSocketOptionsTLS](https://bun.com/reference/bun/WebSocketOptionsTLS/tls)).

> **Consequence for #5: do not put HQ's security boundary on Bun's server-side mTLS verification.** Transport-level mTLS *at HQ* is, as of Bun ~1.2.22, disputed-to-broken. Application-layer key pinning — verify the peer's static public key in our own code, after the handshake, before exposing any RPC — is runtime-independent and sidesteps this entirely. This is not merely a tie-break in favour of #2's Noise-shaped shortlist; it is a hard constraint against the alternative.

**Certificate lifecycle.** Revocation is the known weak point, and Let's Encrypt says so: "certificate revocation doesn't work very well", answering with short lifetimes instead — "The primary advantage of short-lived certificates is that they greatly reduce the potential compromise window... This reduces the need for certificate revocation, which has historically been unreliable", and "Our six-day certificates will not include OCSP or CRL URLs" at all ([LE: six-day and IP certs](https://letsencrypt.org/2025/01/16/6-day-and-ip-certs)).

**Can Let's Encrypt help a Porter with no public DNS name?** Barely, and not where it matters. HTTP-01 needs port 80 and a resolvable domain; DNS-01 needs DNS control but no inbound port; TLS-ALPN-01 runs on 443 and "is not suitable for most people. It is best suited to authors of TLS-terminating reverse proxies" ([Challenge types](https://letsencrypt.org/docs/challenge-types/)). LE now issues **IP-address SANs** on six-day certs — "without the need for a domain name" — but "validation will be restricted to the http-01 and tls-alpn-01 challenge types. The dns-01 challenge type will not be available because the DNS is not involved" ([LE: six-day and IP certs](https://letsencrypt.org/2025/01/16/6-day-and-ip-certs)). So the bare-IP path still requires Porter to accept inbound on 80/443 at issuance *and every renewal* — precisely the posture a NAT'd Porter cannot have *(inferred)*. **Web PKI does not fit Porter.** Self-signed certs plus app-layer pinning do — which is exactly what Portainer and Komodo concluded ([worker-agent-patterns.md](./worker-agent-patterns.md)).

**Noise.** "Noise is a framework for crypto protocols based on Diffie-Hellman key agreement" ([spec §1](https://noiseprotocol.org/noise.html)). It does mutual static-key authentication with no PKI, and the spec names our exact pattern: "A Noise protocol with static public keys verifies that the corresponding private keys are possessed by the participant(s), but it's up to the application to determine whether the remote party's static public key is acceptable... Methods for doing so include... preconfigured lists of public keys, or 'pinning' / 'key-continuity' approaches" ([spec §14](https://noiseprotocol.org/noise.html)). Go implementation `github.com/flynn/noise` exists with CI and tagged releases ([repo](https://github.com/flynn/noise)); exact maintenance recency **unverified**. This is what Komodo v2 uses.

## 9. NAT and dial direction — the fact that collapses the decision

**Unsolicited inbound does not work behind NAT.** RFC 3022: "In a traditional NAT, sessions are uni-directional, outbound from the private network", with inbound only "on an exceptional basis using static address maps for pre-selected hosts" ([RFC 3022](https://www.rfc-editor.org/rfc/rfc3022.html)). RFC 4787: every filtering behaviour requires the internal endpoint to send first ([RFC 4787 §5](https://www.rfc-editor.org/rfc/rfc4787.html)). RFC 5382 for TCP: "the NAT does not allow any connection initiations from the external side" ([RFC 5382 §4.3](https://www.rfc-editor.org/rfc/rfc5382.html)).

**CGNAT makes it impossible, not merely awkward.** RFC 6598 allocates `100.64.0.0/10` and mandates "Packets with Shared Address Space source or destination addresses MUST NOT be forwarded across Service Provider boundaries" ([RFC 6598](https://www.rfc-editor.org/rfc/rfc6598.html)). The customer has no public IP to port-forward on. This is architectural, not a config error.

**Hole punching is not a foundation.** RFC 5128: UDP hole punching "works widely on more than 80% of the NAT devices" tested; TCP is "not implemented correctly on many systems, including NAT devices" and "works on just over 60% of the NAT devices tested" ([RFC 5128 §3.3, §3.4, §4](https://www.rfc-editor.org/rfc/rfc5128.html)). Neither is something to hang a control channel on.

**So: a Porter that cannot accept inbound must dial out, and whatever it dials must be stably reachable.** The symmetry is unavoidable — *someone* must have an address.

**And here is the collapse.** HQ is a web dashboard the operator opens in a browser. In the overwhelmingly common deployment it already has a stable, reachable address — that is what it is *for*. Therefore:

> **A Porter behind NAT needs no tunnel and no overlay. It dials HQ. That is the whole solution.**

Tunnel, WARP/Mesh, Tailscale, and WireGuard all exist to manufacture a reachable endpoint. We already have one.

**And the dial direction does not constrain the request direction.** WebSocket is "a two-way communication channel where each side can, independently from the other, send data at will" ([RFC 6455 §1.2](https://www.rfc-editor.org/rfc/rfc6455.html)), and "A data frame MAY be transmitted by either the client or the server at any time after opening handshake completion" ([RFC 6455 §5.1](https://www.rfc-editor.org/rfc/rfc6455.html)). Once Porter dials HQ, **HQ sends Porter requests over that same socket.** This is precisely the property #2's shortlist ("both dial directions") depends on, and it is now confirmed from the RFC.

WSS also traverses egress filtering for free: the handshake "is an HTTP Upgrade request" and "By default, the WebSocket Protocol uses port 80 for regular WebSocket connections and port 443 for WebSocket connections tunneled over Transport Layer Security" ([RFC 6455 §1.3, §1.7](https://www.rfc-editor.org/rfc/rfc6455.html)). A Porter that can reach an HTTPS site can reach HQ.

**One caveat to design for.** Idle timeouts are everywhere and are not an RFC concern. RFC 6455 defines Ping/Pong — "A Ping frame may serve either as a keepalive or as a means to verify that the remote endpoint is still responsive" ([RFC 6455 §5.5.2](https://www.rfc-editor.org/rfc/rfc6455.html)) — but mandates no interval. Concretely, Bun's own defaults close idle HTTP connections at **10 s** and idle WebSockets at **120 s** ([Bun HTTP](https://bun.sh/docs/api/http), [Bun WebSockets](https://bun.sh/docs/api/websockets)). Any long-lived HQ↔Porter socket must send application-level heartbeats and reconnect with backoff, regardless of transport.

---

## 10. Cross-cutting findings

**"Private network" is a vendor-supplied assumption, not a security property.** Hetzner's two admissions — private traffic is "not automatically encrypted", and firewalls don't cover private networks "because we consider the private networks to be 'secure'" ([Networks FAQ](https://docs.hetzner.com/networking/networks/faq/), [Firewalls FAQ](https://docs.hetzner.com/cloud/firewalls/faq/)) — are a compact argument for not inheriting anyone's trust boundary. Our authentication must be identical on a private network, a LAN, and the open internet. If it is, the private network stops being a security decision and becomes a routing detail.

**Every primitive here provides confidentiality and reachability. None provides the identity we actually need.** Tunnel authenticates *the tunnel* to Cloudflare. Tailscale authenticates *a device* to a tailnet. WireGuard authenticates *a peer* by public key. None of them answers "is this the Porter that HQ enrolled, and is this HQ?" in terms our application can act on. We need pinned-keypair identity at the app layer regardless of which transport we run over — so every transport is additive, not substitutive. Choosing one for v1 means paying for it *and* still building the thing that actually secures the channel. Note the one near-miss: plain WireGuard's `AllowedIPs`-plus-pubkey model *is* structurally the same check — which is why it is redundant with our app layer rather than complementary to it.

**Overlays trade a small, comprehensible failure surface for a larger, outsourced one.** Ranked by blast radius when the primitive breaks: WireGuard (nothing to be down; the link is the link) → Tailscale (existing connections survive; new enrollment, ACL updates, and **revocation** stop — [kb/1091](https://tailscale.com/kb/1091/what-happens-if-the-coordination-server-is-down)) → Cloudflare Tunnel/Mesh (edge is the data path; an outage severs the entire fleet at once) *(inferred)*. Tailscale's honesty here is admirable and instructive: the thing you lose in an outage is *the ability to revoke*, which is exactly the thing a security model most wants during an incident.

**The dial-direction question is answered by an RFC, not a vendor.** RFC 6455's bidirectionality ([§1.2, §5.1](https://www.rfc-editor.org/rfc/rfc6455.html)) means one WSS connection serves both placements. Combined with §9, the entire NAT problem reduces to "who dials", and both answers use the same contract, the same framing, and the same pinned keys. #2 reached this shortlist by surveying tools; the RFCs confirm it is the *only* option that needs no third party.

**The runtime, not the threat model, rules out mTLS at HQ.** Bun's server-side `requestCert`/`rejectUnauthorized` being disputed-to-broken ([#22870](https://github.com/oven-sh/bun/issues/22870), [#11587](https://github.com/oven-sh/bun/discussions/11587)) is an uncomfortable but decisive input: the ecosystem picked our crypto layer for us. Fortunately it picked the one the surveyed tools already converged on — application-layer pinning, TLS for confidentiality only ([worker-agent-patterns.md](./worker-agent-patterns.md)).

**Free is not the constraint.** Hetzner Networks and Firewalls are free ([overview](https://docs.hetzner.com/networking/networks/overview/), [overview](https://docs.hetzner.com/cloud/firewalls/overview/)); Cloudflare Tunnel and WARP-to-WARP are free ([blog](https://blog.cloudflare.com/warp-to-warp/)); Tailscale is free for a solo operator with unlimited devices ([pricing](https://tailscale.com/pricing)); WireGuard is free. **Every option costs €0 and they still differ enormously.** The real currency is operational surface, dependency count, and blast radius — so cost should be struck from the decision entirely.

---

## 11. Ranking: overengineering vs the minimum

**Overengineering for v1, worst offender first:**

1. **Cloudflare WARP / Mesh.** Requires a Zero Trust org and device-enrollment policy; grants *more* reach than we want (any-to-any East-West, clawed back with policy) when the requirement is "HQ→Porter and nothing else"; headless enrollment explicitly sacrifices identity-based policy and logging ([Headless Linux](https://developers.cloudflare.com/cloudflare-one/tutorials/warp-on-headless-linux/)); Cloudflare in the data path; fleet-wide correlated failure. Maximum machinery, wrong shape.
2. **Headscale.** Self-hosting a reverse-engineered, explicitly-not-scale-optimized, officially-unaffiliated control plane ([FAQ](https://github.com/juanfont/headscale/blob/main/docs/about/faq.md)) — we would own its uptime, its upgrades, and its protocol drift, to avoid a dependency we shouldn't be taking in v1 anyway.
3. **Cloudflare Tunnel.** A second daemon per host, an account coupling, a bearer token that lets anyone run the tunnel ([Tunnel tokens](https://developers.cloudflare.com/tunnel/advanced/tunnel-tokens/)), a self-updating third-party binary next to our agent ([Run parameters](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/run-parameters/)), a terminating proxy that reads what it forwards, and a non-configurable WebSocket idle timeout below Enterprise ([WebSockets](https://developers.cloudflare.com/network/websockets/)) — all to obtain outbound-only reachability that §9 shows we already get free by having Porter dial HQ.
4. **Tailscale SaaS.** Genuinely excellent, free for us, and `tsnet` keeps the single-binary story ([tsnet](https://tailscale.com/kb/1244/tsnet)). Still overengineering *for v1*: a SaaS control plane plus a mandatory third-party IdP ([SSO IdPs](https://tailscale.com/docs/integrations/identity)) inside a self-hosted single-operator product, adding a second identity system next to HQ's own auth/2FA, to solve NAT traversal we don't need solved.
5. **Plain WireGuard.** No third party, keys as files — very much our taste. But it duplicates the mutual-static-key check our app layer must do anyway, adds O(n) hand-distributed peer config with no rotation or revocation story, and still cannot connect two NAT'd peers ([wg(8)](https://git.zx2c4.com/wireguard-tools/about/src/man/wg.8)). Redundant, not additive.
6. **Hetzner private network as a security boundary.** Not merely overengineering — *actively wrong*: unencrypted by Hetzner's own statement, unfiltered by Hetzner's own firewall, same-zone and same-provider only ([Networks FAQ](https://docs.hetzner.com/networking/networks/faq/), [Firewalls FAQ](https://docs.hetzner.com/cloud/firewalls/faq/)). Fine as a free routing/cost optimization *once security no longer depends on it*.
7. **Web PKI / Let's Encrypt certs for Porter.** Every issuance and every renewal re-requires the inbound port or DNS control that NAT'd Porters lack ([Challenge types](https://letsencrypt.org/docs/challenge-types/), [six-day and IP certs](https://letsencrypt.org/2025/01/16/6-day-and-ip-certs)) — recurring operational failure in exchange for a CA signature our pinning never consults.
8. **mTLS terminated at HQ.** Ruled out by the runtime, not by taste ([#22870](https://github.com/oven-sh/bun/issues/22870), [#11587](https://github.com/oven-sh/bun/discussions/11587)).

**Not overengineering — keep:**

- **Hetzner Cloud Firewall** where a Porter is a Hetzner Cloud server. Free, stateful, default-deny inbound ([overview](https://docs.hetzner.com/cloud/firewalls/overview/)). Use it; never depend on it (no SLA, public interface only, source-IP-only rules that evaporate when HQ has no stable IP).
- **A host firewall, default-deny.** Already mandated by our own first-run flow ("Enable a host firewall with only the required ports open", `docs/index.md`). This is the control that works identically on every provider, on a private network, and behind NAT — the only one we fully own.

**The minimum that does not compromise security** — none of these is negotiable, and together they are sufficient:

1. **Mutual pinned-keypair authentication at the application layer**, verified before any RPC surface is exposed — Noise-shaped, per #2 and [Noise spec §14](https://noiseprotocol.org/noise.html).
2. **TLS for confidentiality only**; self-signed is fine, because authenticity never depends on the certificate (the Portainer/Komodo conclusion — [worker-agent-patterns.md](./worker-agent-patterns.md)).
3. **Bootstrap token: single-use, short-TTL, upgraded to pinned per-machine keys**, then worthless (#2).
4. **Host firewall default-deny**, only Porter's port and SSH open.
5. **Key rotation and revocation owned by HQ** — because no primitive here gives it to us, and the one that comes closest loses it precisely during an outage ([kb/1091](https://tailscale.com/kb/1091/what-happens-if-the-coordination-server-is-down)).

---

## 12. Recommendation

### Ship this baseline

**Porter listens on one TCP port speaking WSS, with mutual pinned-keypair authentication at the application layer, behind a default-deny host firewall — and dials out to HQ instead whenever it cannot accept inbound. No overlay, no tunnel, no provider-specific network primitive.**

Concretely:

- **Identity:** mutual static-public-key pinning in Porter's own Go code and HQ's own TypeScript, checked before any RPC verb is reachable. Not web PKI, not CA chains, not Bun's server-side mTLS. Keys as plain files on disk, per the standing filesystem-transparent preference.
- **Confidentiality:** TLS with a self-signed cert generated at first start. Authenticity comes from pinning, so the cert never needs a CA, a domain, or a renewal.
- **Transport:** one WSS connection, multiplexed, per #2's shortlist. Both dial directions, **same contract either way** — RFC 6455 §1.2/§5.1 guarantee HQ can issue requests over a Porter-initiated socket ([RFC 6455](https://www.rfc-editor.org/rfc/rfc6455.html)).
  - Porter reachable (Hetzner Cloud, LAN, same-host): HQ dials Porter.
  - Porter behind NAT/CGNAT: Porter dials HQ. This is the *default* for internet Porters — it needs no third party, and per §9 it dissolves the entire NAT problem.
- **Exposure:** host firewall default-deny; open only Porter's port (and only when HQ dials Porter — an outbound-only Porter opens **nothing**) plus SSH. Add the free Hetzner Cloud Firewall as a second lock on Hetzner Cloud, with a `<HQ-IP>/32` source rule when HQ has a stable address, and accept that it degrades to nothing when HQ doesn't — which is exactly why it is the second lock and not the first.
- **Heartbeats:** application-level ping/pong plus reconnect-with-backoff from day one. Bun's own 120 s idle-WebSocket default ([Bun WebSockets](https://bun.sh/docs/api/websockets)) will bite before any third-party middlebox does.

**Why this and not something safer-sounding.** Every alternative on the list costs €0 and still costs a daemon, an account, an IdP, or a control plane — and *none* of them removes the need for step 1, because none of them can answer "is this the Porter HQ enrolled?" in application terms. Adopting one for v1 means paying its operational price *and* building the pinning anyway. Meanwhile the port that pinning leaves exposed is the same shape as the `sshd` port already on every one of these boxes.

**What we are explicitly accepting.** A publicly-dialable port on inbound Porters: it reveals that a service exists, presents a pre-auth TLS parser, and is DoS-able. Mitigations: default-deny firewall, source allowlist where HQ is static, outbound-only mode for anything behind NAT (which exposes nothing at all). That is a bounded, well-understood surface — and unlike a tunnel outage or a coordination-server outage, it fails in ways we can see and fix ourselves.

### First upgrade step

**Optional per-Porter Tailscale transport, embedded via `tsnet`.**

The one deployment the baseline genuinely cannot serve is *HQ not publicly reachable **and** Porter not able to accept inbound* — e.g. HQ on the operator's laptop or LAN, Porter behind CGNAT. Neither side has an address; per §9 someone must. That is the moment an overlay stops being overengineering and starts being the answer — and not one moment earlier.

Tailscale is the right pick when it comes:
- **`tsnet` keeps the single-binary story** — a Tailscale node inside the Go process, no `tailscaled`, no root, no host TUN, state in a directory we control ([tsnet](https://tailscale.com/kb/1244/tsnet)). No competitor offers this; `wireguard-go` is a full peer, `cloudflared` is a second daemon.
- **Best failure mode of any control plane here** — existing connections survive an outage ([kb/1091](https://tailscale.com/kb/1091/what-happens-if-the-coordination-server-is-down)); set node-key expiry off for Porters, as Tailscale itself recommends for "trusted servers... that are hard to reach" ([Key expiry](https://tailscale.com/docs/features/access-control/key-expiry)).
- **DERP cannot read our traffic** ([DERP servers](https://tailscale.com/docs/reference/derp-servers)) — unlike a terminating edge proxy.
- **Free for a solo operator**, unlimited devices ([pricing](https://tailscale.com/pricing)).

Two conditions on that upgrade:

1. **It is a transport, never an identity.** Keep pinned-keypair auth unchanged on top. Tailscale answers "can these hosts route to each other"; only our pinning answers "is this the right Porter". This also keeps the upgrade a *swap*, not a rewrite — the same property #2 noted about its A↔B transports.
2. **It stays opt-in and per-Porter.** The baseline must remain the zero-dependency path, so the SaaS + IdP dependency is only ever paid by the operator who actually needs it.

Explicitly *not* the first upgrade: Cloudflare Tunnel (buys outbound-only reachability we already have), Headscale (defer until a real customer refuses the SaaS dependency), or Hetzner private networks (a routing optimization, not a security step).

---

## Open questions for #5

- **Ping interval and reconnect backoff.** Bun closes idle sockets at 120 s by default ([Bun WebSockets](https://bun.sh/docs/api/websockets)); RFC 6455 mandates no interval ([§5.5.2](https://www.rfc-editor.org/rfc/rfc6455.html)). Pick a number and a backoff curve.
- **Choosing dial direction.** Operator-declared at enrollment, or Porter attempts inbound and falls back to outbound? Cheapest correct default is probably "outbound unless told otherwise" — it works everywhere and opens no port.
- **Revocation during an HQ outage.** No primitive gives us revocation; Tailscale loses it exactly when the control plane is down ([kb/1091](https://tailscale.com/kb/1091/what-happens-if-the-coordination-server-is-down)). Does Porter need a local kill-switch or a key TTL that fails closed?
- **`flynn/noise` vs hand-rolled pinning over TLS.** Noise gives a reviewed handshake ([spec](https://noiseprotocol.org/noise.html)); its Go implementation's maintenance recency is **unverified** and worth checking before committing.
- **Bun's mTLS bugs.** Worth re-testing against current Bun before #5 locks — the baseline doesn't depend on them being fixed, but confirming the state of [#22870](https://github.com/oven-sh/bun/issues/22870) removes a footgun for anyone who later reaches for `requestCert`.
