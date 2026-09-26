# Each Porter runs its own proxy, and HQ always has a Porter

Public traffic enters through a Caddy container on the Porter that runs the service, not through a central proxy on HQ. The HQ installer always installs a Porter on the HQ host, and that Porter's proxy also serves HQ's own hostname.

A central proxy on HQ was the main alternative. It would give one public entry point, one IP address for DNS, and Porters with no public ports. We rejected it for two reasons. First, HQ would carry production traffic, so an HQ outage or upgrade would take every application offline, although HQ is otherwise only a control plane. Second, HQ would need to reach every Porter's service ports, which breaks the outbound-only Porter contract in [ADR 0001](0001-porter-outbound-api-token.md) and excludes Porters behind NAT. Requiring a Porter on the HQ host means Docker is required there, but HQ's own TLS then needs no separate proxy setup.

Agreed in [Reverse proxy manager](https://github.com/getalfredo/alfredo/issues/10); see [the spec](../spec/reverse-proxy.md).
