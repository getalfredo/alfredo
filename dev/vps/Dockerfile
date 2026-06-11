FROM ubuntu:24.04

# docker CLI + compose plugin (the daemon lives in the dind container)
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable" \
        > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /bin/bash alfredo \
    && mkdir -p /home/alfredo/app /home/alfredo/stacks \
    && chown -R alfredo:alfredo /home/alfredo

COPY --chmod=0755 alfredo /usr/local/bin/alfredo

WORKDIR /home/alfredo/app
EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/alfredo"]
CMD ["serve"]
