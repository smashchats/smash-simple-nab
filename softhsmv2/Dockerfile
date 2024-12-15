FROM ubuntu:24.04 AS base
RUN apt-get update

FROM base AS source
RUN apt-get install -y --no-install-recommends git ca-certificates
RUN git clone https://github.com/opendnssec/SoftHSMv2.git /tmp/softhsm2

FROM base AS build-deps
RUN apt-get install -y --no-install-recommends \
    build-essential \
    openssl sqlite3 \
    libp11-kit-dev \
    automake \
    autoconf \
    libtool \
    pkg-config \
    libssl-dev

FROM build-deps AS build
COPY --from=source /tmp/softhsm2 /tmp/softhsm2
WORKDIR /tmp/softhsm2
RUN sh autogen.sh
RUN ./configure --prefix=/usr/local --with-crypto-backend=openssl
RUN make
RUN make install
RUN mkdir -p /usr/local/var/lib/softhsm/tokens/
RUN softhsm2-util --version

# ================================

# TODO: build vs run stages (& deps)
FROM build AS final
# TODO: separate SoftHSM and Node app in two micro services (as in https://github.com/vegardit/docker-softhsm2-pkcs11-proxy/)
RUN apt-get install -y --no-install-recommends opensc
RUN apt-get install -y curl nano wget
RUN curl -sL https://deb.nodesource.com/setup_20.x -o /tmp/nodesource_setup.sh && \
    bash /tmp/nodesource_setup.sh && \
    apt update && \
    apt install -y nodejs
RUN apt-get install -y git && apt-get clean && apt-get autoremove -y

# Update the package list, install sudo, create a non-root user, and grant password-less sudo permissions
RUN apt update && \
    apt install -y sudo && \
    usermod -l node $(getent passwd 1000 | cut -d: -f1) && \
    groupmod -n node $(getent group 1000 | cut -d: -f1) && \
    usermod -d /home/node -m node && \
    echo 'node ALL=(ALL) NOPASSWD: ALL' >> /etc/sudoers
