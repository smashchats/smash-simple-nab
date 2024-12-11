# Smash Neighborhood Admin Bot (NAB)

The [**Smash Neighborhood Admin Bot (NAB)**](<https://dev.smashchats.com/neighborhood%20admin%20bot%20(nab)>) is part of the [**Smash Protocol**](https://dev.smashchats.com/smash%20protocol), a decentralized, secure system designed to give users control over their data, communication, and interactions. NAB helps manage communities, called [**Smash Neighborhoods**](<https://dev.smashchats.com/smash%20neighborhoods%20(nbh)>), by guiding users, facilitating interactions, and ensuring secure, peer-to-peer connections.

This repository contains a demo implementation of a NAB based on the [Smash Node Library](https://github.com/unstaticlabs/smash-node-lib).

## What is Smash?

The **Smash Protocol** is a decentralized communication system where users:

- Control their own data.
- Communicate privately through end-to-end encryption.
- Use cryptographic identities (DIDs) to maintain privacy and trust.

Neighborhoods are communities where people connect, interact, and build trust without centralized control or interference. Smash ensures that no single authority controls your interactions or data.

## Features of this NAB

1. **Decentralized Identity**: NAB manages its DID securely using **Hardware Security Modules (HSM)**, ensuring privacy and data protection.

2. **Neighborhood Management**: NAB handles user onboarding, manages community interactions, and maintains the neighborhood's integrity.

3. **Smash/Pass/Block interactions**: NAB handles smash/pass action to build the local user graph.

4. **Graph Visualization**: Optionally, the user network can be visualized as a graph, displaying connections between users in a clear, visual way.

## How does it work?

1. **Initialization**:

    - Loads necessary configurations and settings from environment variables.
    - Sets up cryptographic components using **Hardware Security Modules (HSM)** for secure identity management.

2. **Identity Management**:

    - NAB reads and manages its identity through a secure file and keeps cryptographic keys safe using HSM.

3. **Network Setup**:

    - Sets up secure messaging endpoints for **peer-to-peer (P2P)** communication.
    - Prepares the network for users to join and interact within the neighborhood.

4. **User Interactions**:

    - NAB assists users in joining the neighborhood and interacting with others.
    - It manages badges, reputation, and helps maintain a healthy community environment.

5. **Graph Visualization (optional)**:

    - There’s an option to visualize the user network as a graph, displaying connections between users in a clear, visual way.

## Getting started

To start using the Smash NAB:

1. **Set up environment variables**:

> Get examples in the [.env.example](.env.example) file.

    - `HSM_CONFIG`: Hardware Security Module settings.
    - `NAB_ID_FILEPATH`: Path to the file containing NAB’s identity.
    - `SME_CONFIG`: Configuration for the messaging engine.
    - `NAB_META`: Metadata for the NAB.

2. **Install dependencies**:

    ```bash
    npm install
    ```

3. **Run the bot**:
    ```bash
    npm run generate-id
    npm start
    ```

NAB will now manage the example neighborhood and facilitate user interactions!

## Development Notes

- **TypeScript** is used for development.
- **ESLint** and **Prettier** ensure clean, readable, and well-formatted code.
- The project uses [**Devcontainers**](https://containers.dev/) for a consistent development environment.

Check out the parent project ([simple neighborhood](https://github.com/unstaticlabs/smash-simple-neighborhood)) for a complete example of a Neighborhood deployment (using Docker Compose) including this NAB and additional providers (Smash Messaging Endpoint, DNS server, etc).

[Browse open issues](https://app.radicle.xyz/nodes/seed.radicle.garden/rad:z3w1tD8MyHaAjrv9wGgLEBUiz95kr/issues). or, [start contributing today!](../docs/CONTRIBUTING.md)

## Contributing

We love contributions! If you'd like to improve this project, please:

1. Follow coding standards enforced by **ESLint** and **Prettier**.
2. If you modify the Smash Protocol, ensure your work is **open-sourced** according to the **Smash License**.

Read more on contributing to the Smash Protocol [here](https://dev.smashchats.com/contributing%20to%20smash).

## Additional Resources

- [Smash Protocol](https://www.smashchats.com/)
- Smash [Principles](https://dev.smashchats.com/smash%20principles) and [Values](https://dev.smashchats.com/smash%20values)

---

### Setup for Developers

The project uses [**Devcontainers**](https://containers.dev/) for a consistent development environment.

1. Install required libraries:

    ```bash
    apt-get update
    apt-get install -y --no-install-recommends git openssl sqlite3 libp11-kit-dev automake autoconf libtool pkg-config
    ```

2. Set up **SoftHSMv2** for cryptographic operations:
    ```bash
    git clone https://github.com/opendnssec/SoftHSMv2.git /tmp/softhsm2
    cd /tmp/softhsm2
    sh autogen.sh
    ./configure --prefix=/usr/local --with-crypto-backend=openssl
    make
    sudo make install
    mkdir -p /usr/local/var/lib/softhsm/tokens/
    ```

For more information on cryptographic dependencies, visit:

- [Node-WebCrypto-P11](https://www.npmjs.com/package/node-webcrypto-p11)
- [WebCrypto](https://github.com/PeculiarVentures/webcrypto-docs/blob/master/CRYPTO_STORAGE.md)
- [Graphene](https://github.com/PeculiarVentures/graphene)
- [SoftHSMv2](https://github.com/opendnssec/SoftHSMv2)
- [SoftHSMv2 README](https://github.com/opendnssec/SoftHSMv2/blob/develop/README.md)
- [Google Cloud KMS](https://cloud.google.com/kms/docs/reference/pkcs11-library)

## **Licensing**

All contributions to Smash-Simple-Neighborhood are made under our extended [AGPL-3.0 License](./LICENSE).
By contributing, you agree to license your work under these terms.

**By using this repository, you agree to the terms of the [Smash License](./LICENSE).**

**Any changes or derived projects MUST be open-sourced under a compatible license.**
