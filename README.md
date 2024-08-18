# create-k4

`create-k4` is a CLI tool to bootstrap and manage pnpm/turborepo monorepos with a focus on Next.js and Node.js applications. It provides a streamlined way to set up a modern, scalable monorepo structure with best practices baked in, while maintaining minimal configuration. Despite being batteries-included with features like ESLint, TypeScript, and build tools, the project emphasizes simplicity, keeping all configurations lean and easily customizable.

## Features

- Quickly bootstrap a new monorepo with pnpm and Turborepo
- Set up Next.js and Node.js applications within the monorepo
- Integrate shared packages for common functionality
- Configure ESLint, Prettier, and TypeScript for code quality
- Set up a PostgreSQL database with Prisma ORM
- Configure BullMQ for background job processing
- Implement Docker for consistent development environments

## Tech Stack

- **Package Manager**: pnpm
- **Monorepo Tool**: Turborepo
- **Web Framework**: Next.js
- **Supporting Backend**: Node.js
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Queue**: BullMQ
- **Containerization**: Docker
- **Language**: TypeScript
- **Linting**: ESLint
- **Formatting**: Prettier

## Usage

To create a new monorepo project, run:

```bash
npx create-k4@latest <name>
```

Follow the interactive prompts to customize your project setup.

## Project Structure

The generated monorepo will have the following structure:

```
my-monorepo/
├── apps/
│   ├── web/               # Next.js web application
│   └── worker/            # Node.js worker application
├── packages/
│   ├── db/                # Shared database package (Prisma)
│   ├── docker-dev/        # Docker Compose configuration for development
│   ├── queue/             # Shared queue package (BullMQ)
│   ├── eslint-config/     # Shared ESLint configuration
│   └── typescript-config/ # Shared TypeScript configuration
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

## Commands

Once your project is set up, you can use the following commands:

1. `pnpm dev`: Start the development environment
2. `pnpm db:init`: Initialize the database

Other commands available:

- `pnpm build`: Build all packages and apps
- `pnpm lint`: Run ESLint for all packages and apps
- `pnpm format`: Format all files using Prettier
- `pnpm test`: Run tests for all packages and apps

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Creator

This project was created by Kevin Wade ([YouTube](https://www.youtube.com/@kevinwwwade), [X/Twitter](https://x.com/kevinwwwade), [GitHub](https://github.com/mrwade)).

## License

This project is licensed under the MIT License.
