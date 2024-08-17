import { select } from "@inquirer/prompts";
import { execSync } from "child_process";
import { program } from "commander";
import fs from "fs-extra";
import path from "path";
import prettier from "prettier";

const getPnpmVersion = () => {
  try {
    return execSync("pnpm --version", { encoding: "utf8" }).trim();
  } catch (error) {
    console.warn("Could not determine pnpm version. Using default.");
    return "9.7.0"; // Fallback version
  }
};

const createPackage = (
  packageName: string,
  files: { [key: string]: string },
  options?: {
    scripts?: { [key: string]: string };
  }
) => {
  const packageDir = path.join("packages", packageName);
  fs.mkdirSync(packageDir, { recursive: true });
  fs.mkdirSync(path.join(packageDir, "src"));

  const packageJson = {
    name: `@repo/${packageName}`,
    private: true,
    type: "module",
    exports: {
      ".": {
        types: "./src/index.ts",
        default: "./dist/index.js",
      },
    },
    scripts: {
      build: "tsup --clean",
      "check-types": "tsc --noEmit",
      dev: "tsup --watch",
      ...options?.scripts,
    },
  };
  fs.writeFileSync(
    path.join(packageDir, "package.json"),
    JSON.stringify(packageJson, null, 2)
  );

  const tsConfig = {
    extends: "@repo/typescript-config/base.json",
    compilerOptions: {
      outDir: "./dist",
    },
    include: ["src/**/*"],
    exclude: ["node_modules"],
  };
  fs.writeFileSync(
    path.join(packageDir, "tsconfig.json"),
    JSON.stringify(tsConfig, null, 2)
  );

  const tsupConfig = `
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  splitting: false,
  sourcemap: true,
  clean: true,
});
`;
  fs.writeFileSync(path.join(packageDir, "tsup.config.ts"), tsupConfig);

  Object.entries(files).forEach(([filePath, content]) => {
    const fullPath = path.join(packageDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  });

  console.log(`Installing dependencies for ${packageName} package...`);
  execSync("pnpm add -D tsup typescript @repo/typescript-config@workspace:*", {
    stdio: "inherit",
    cwd: packageDir,
  });
};

const createNodeApp = (name: string, files: { [key: string]: string }) => {
  const appDir = path.join("apps", name);
  fs.mkdirSync(appDir, { recursive: true });

  const packageJson = {
    name: `@repo/${name}`,
    private: true,
    type: "module",
    scripts: {
      build: "tsup --clean",
      "check-types": "tsc --noEmit",
      dev: "tsup --watch --onSuccess 'pnpm start'",
      start: "node dist/index.js",
    },
  };
  fs.writeFileSync(
    path.join(appDir, "package.json"),
    JSON.stringify(packageJson, null, 2)
  );

  const tsConfig = {
    extends: "@repo/typescript-config/base.json",
  };
  fs.writeFileSync(
    path.join(appDir, "tsconfig.json"),
    JSON.stringify(tsConfig, null, 2)
  );

  const tsupConfig = `
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  splitting: false,
  sourcemap: true,
});
`;
  fs.writeFileSync(path.join(appDir, "tsup.config.ts"), tsupConfig);

  Object.entries(files).forEach(([filePath, content]) => {
    const fullPath = path.join(appDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  });

  console.log(`Installing dependencies for ${name} app...`);
  execSync(
    "pnpm add @repo/typescript-config@workspace:* @repo/db@workspace:* @repo/queue@workspace:*",
    {
      stdio: "inherit",
      cwd: appDir,
    }
  );
  execSync("pnpm add -D tsup typescript", {
    stdio: "inherit",
    cwd: appDir,
  });
};

const createNextApp = (name: string, files: { [key: string]: string } = {}) => {
  const appDir = path.join("apps", name);

  console.log(`Creating Next.js app: ${name}`);
  execSync(
    `npx create-next-app@latest ${appDir} --typescript --eslint --tailwind --app --src-dir --import-alias "@/*" --use-pnpm --no-git`,
    { stdio: "inherit" }
  );

  Object.entries(files).forEach(([filePath, content]) => {
    const fullPath = path.join(appDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  });

  console.log(`Installing additional dependencies for ${name} app...`);
  execSync("pnpm add @repo/db@workspace:* @repo/queue@workspace:*", {
    stdio: "inherit",
    cwd: appDir,
  });
};

const initializeMonorepo = async (appName: string) => {
  // Create root directory
  fs.mkdirSync(appName);
  process.chdir(appName);

  // Initialize pnpm workspace
  fs.writeFileSync(
    "pnpm-workspace.yaml",
    'packages:\n  - "apps/*"\n  - "packages/*"\n'
  );

  // Create apps and packages directories
  fs.mkdirSync("apps");
  fs.mkdirSync("packages");

  // Initialize package.json
  const pnpmVersion = getPnpmVersion();
  const packageJson = {
    name: appName,
    private: true,
    packageManager: `pnpm@${pnpmVersion}`,
    scripts: {
      build: "turbo run build",
      "check-types": "turbo run check-types",
      db: "pnpm --filter @repo/db",
      "db:reset": "pnpm docker-dev db:reset && pnpm db migrate dev",
      dev: "turbo run dev",
      test: "turbo run test",
    },
    devDependencies: {
      turbo: "latest",
    },
  };
  fs.writeFileSync("package.json", JSON.stringify(packageJson, null, 2));

  // Install @types/node
  console.log("Installing @types/node...");
  execSync("pnpm add -w -D @types/node", { stdio: "inherit" });

  // Create turbo.json
  const turboConfig = {
    $schema: "https://turbo.build/schema.json",
    ui: "tui",
    tasks: {
      build: {
        dependsOn: ["^build"],
        inputs: ["$TURBO_DEFAULT$", ".env*"],
        outputs: [".next/**", "!.next/cache/**", "dist/**"],
      },
      "check-types": {
        dependsOn: ["^check-types"],
      },
      dev: {
        cache: false,
        persistent: true,
      },
      test: {
        cache: false,
        persistent: true,
      },
    },
  };
  const formattedTurboConfig = await prettier.format(
    JSON.stringify(turboConfig),
    { parser: "json" }
  );
  fs.writeFileSync("turbo.json", formattedTurboConfig);

  // Initialize TypeScript config
  fs.mkdirSync("packages/typescript-config", { recursive: true });

  // Create package.json for typescript-config
  const tsConfigPackageJson = {
    name: "@repo/typescript-config",
    version: "1.0.0",
    private: true,
    license: "MIT",
    publishConfig: {
      access: "public",
    },
  };
  fs.writeFileSync(
    "packages/typescript-config/package.json",
    JSON.stringify(tsConfigPackageJson, null, 2)
  );

  // Install latest @tsconfig/node20
  console.log("Installing latest @tsconfig/node20...");
  execSync("pnpm add -D @tsconfig/node20", {
    stdio: "inherit",
    cwd: "packages/typescript-config",
  });

  // Create tsconfig base
  const tsConfigBase = {
    $schema: "https://json.schemastore.org/tsconfig",
    extends: "@tsconfig/node20/tsconfig.json",
    compilerOptions: {
      module: "ESNext",
      moduleResolution: "Bundler",
    },
  };
  fs.writeFileSync(
    "packages/typescript-config/base.json",
    JSON.stringify(tsConfigBase, null, 2)
  );

  // Initialize Docker Compose config
  const dbName = `${appName.replace(/-/g, "_")}_dev`;
  const dockerComposeConfig = `
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: ${dbName}
    ports:
      - "5432:5432"
    volumes:
      - /var/lib/postgresql/data

  redis:
    image: redis:6.2-alpine
    ports:
      - "6379:6379"
`;
  fs.mkdirSync("packages/docker-dev");
  fs.writeFileSync("packages/docker-dev/compose.yml", dockerComposeConfig);

  const dockerDevPackageJson = {
    name: "@repo/docker-dev",
    private: true,
    scripts: {
      dev: "docker compose up",
      "db:reset":
        "docker compose rm --force --stop postgres && docker compose up -d",
    },
    devDependencies: {
      typescript: "^5.5.4",
    },
  };
  fs.writeFileSync(
    "packages/docker-dev/package.json",
    JSON.stringify(dockerDevPackageJson, null, 2)
  );

  // Create .gitignore file
  const gitignoreContent = `
# Dependencies
node_modules

# Builds
.next/
dist/

# Misc
.DS_Store
*.pem

# Debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Local env files
.env*.local

# Turbo
.turbo
`;

  fs.writeFileSync(".gitignore", gitignoreContent.trim());

  // Install dependencies
  console.log("Installing dependencies...");
  execSync("pnpm install", { stdio: "inherit" });

  // Initialize db package
  createPackage(
    "db",
    {
      ".env": `
# Environment variables declared in this file are automatically made available to Prisma.
# See the documentation for more detail: https://pris.ly/d/prisma-schema#accessing-environment-variables-from-the-schema

# Prisma supports the native connection string format for PostgreSQL, MySQL, SQLite, SQL Server, MongoDB and CockroachDB.
# See the documentation for all the connection string options: https://pris.ly/d/connection-strings

DATABASE_URL="postgresql://postgres:postgres@localhost:5432/${dbName}?schema=public"
`,
      "prisma/schema.prisma": `
// This is your Prisma schema file,
// learn more about it in the docs: https://pris.ly/d/prisma-schema

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Post {
  id        String   @id @db.VarChar(12)
  userId    String   @db.VarChar(12)
  user      User     @relation(fields: [userId], references: [id])
  content   String   @db.VarChar(240)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at")

  @@map("posts")
}

model User {
  id        String   @id @db.VarChar(12)
  username  String   @unique @db.VarChar(32)
  name      String   @db.VarChar(32)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at")

  posts Post[]

  @@map("users")
}
`,
      "src/util.ts": `
import { customAlphabet } from "nanoid";

export const genId = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  12
);
`,
      "src/index.ts": `
export { Prisma, PrismaClient } from "@prisma/client";
export type { Post as PostEntity, User as UserEntity } from "@prisma/client";
export { db } from "./db";
export { genId } from "./util";
`,
      "src/db.ts": `
import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

let db: PrismaClient;

const isServer =
  typeof process !== "undefined" && process.versions && process.versions.node;
if (isServer) {
  if (process.env.NODE_ENV === "production") {
    db = new PrismaClient();
  } else {
    if (!global.prisma) {
      global.prisma = new PrismaClient({
        log: ["query", "info", "warn", "error"],
      });
    }
    db = global.prisma;
  }
}

export { db };
`,
    },
    {
      scripts: {
        build: "pnpm build:prisma && tsup --clean",
        "build:prisma": "prisma generate",
        "check-types": "tsc --noEmit",
        dev: "tsup --watch",
        migrate: "prisma migrate",
        push: "prisma db push",
      },
    }
  );
  console.log("Installing additional dependencies for db package...");
  const dbDir = path.join("packages", "db");
  execSync("pnpm add @prisma/client nanoid", {
    stdio: "inherit",
    cwd: dbDir,
  });
  execSync("pnpm add -D prisma", {
    stdio: "inherit",
    cwd: dbDir,
  });

  createPackage("queue", {
    "src/index.ts": `
import { Queue, QueueEvents } from "bullmq";
import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
export const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

export const QUEUE_NAME = "queue";
export const queue = new Queue(QUEUE_NAME, { connection: redis });

export enum JobType {
  GeneratePosts = "generate-posts",
}

export type JobData = {
  [JobType.GeneratePosts]: { count: number };
};

export async function enqueue<T extends JobType>(type: T, data: JobData[T]) {
  return queue.add(type, data);
}

const queueEvents = new QueueEvents(QUEUE_NAME);
export async function enqueueAndWait<T extends JobType>(
  type: T,
  data: JobData[T]
) {
  const job = await enqueue(type, data);
  await job.waitUntilFinished(queueEvents);
  return job;
}
`,
  });

  console.log("Installing additional dependencies for queue package...");
  execSync("pnpm add bullmq ioredis", {
    stdio: "inherit",
    cwd: path.join("packages", "queue"),
  });

  // Initialize worker app
  createNodeApp("worker", {
    "src/index.ts": `
import { JobType, QUEUE_NAME, redis } from "@repo/queue";
import { Worker } from "bullmq";
import { runGeneratePosts } from "./jobs/generate-posts";

const runners = {
  [JobType.GeneratePosts]: runGeneratePosts,
};

new Worker(
  QUEUE_NAME,
  async (job) => {
    const runner = runners[job.name as JobType];
    if (!runner) {
      console.error(\`Unknown job type\`, job.name);
      throw new Error(\`Unknown job type \${job.name}\`);
    }

    console.log(\`[\${job.id}] \${job.name} - Running...\`, job.data);
    await runner(job.data);
    console.log(\`[\${job.id}] \${job.name} - Completed\`);
  },
  { connection: redis }
);
`,
    "src/jobs/generate-posts.ts": `
import { faker } from "@faker-js/faker";
import { db, genId } from "@repo/db";
import { JobData, JobType } from "@repo/queue";

export const runGeneratePosts = async (
  data: JobData[JobType.GeneratePosts]
) => {
  const { count } = data;

  await db.$transaction(
    Array.from({ length: count }).map(() => {
      const data = {
        id: genId(),
        username: faker.internet.userName(),
        fullName: faker.person.fullName(),
        content: faker.lorem.paragraph({ min: 1, max: 3 }),
        createdAt: faker.date.recent({ days: 30 }),
      };
      console.log(data);
      return db.post.create({
        data: {
          id: data.id,
          content: data.content,
          createdAt: data.createdAt,
          user: {
            connectOrCreate: {
              create: {
                id: genId(),
                name: data.fullName,
                username: data.username,
              },
              where: {
                username: data.username,
              },
            },
          },
        },
      });
    })
  );
};
`,
  });

  console.log("Installing additional dependencies for worker app...");
  execSync("pnpm add bullmq @faker-js/faker", {
    stdio: "inherit",
    cwd: path.join("apps", "worker"),
  });

  // Initialize web app (Next.js)
  createNextApp("web", {
    "src/actions.ts": `
"use server";

import { enqueueAndWait, JobType } from "@repo/queue";
import { revalidatePath } from "next/cache";

export async function generatePosts() {
  await enqueueAndWait(JobType.GeneratePosts, { count: 5 });
  revalidatePath("/");
}
`,
    "src/app/page.tsx": `
import { generatePosts } from "@/actions";
import { db } from "@repo/db";

export default async function Home() {
  const posts = await db.post.findMany({
    select: {
      id: true,
      content: true,
      createdAt: true,
      user: { select: { id: true, username: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="max-w-2xl mx-auto p-4">
      <form action={generatePosts} className="flex justify-end mb-6">
        <button
          type="submit"
          className="bg-[#61afef] hover:bg-[#528bbd] text-[#1a1d24] font-bold py-2 px-4 rounded-md shadow-lg transition duration-300"
        >
          Generate Posts
        </button>
      </form>

      {posts.map((post) => (
        <div
          key={post.id}
          className="bg-[#21252b] shadow-lg rounded-md p-4 mb-4 border border-[#528bbd]"
        >
          <p className="font-bold text-[#ff79c6]">@{post.user.username}</p>
          <p className="mt-2 text-[#dcdfe4]">{post.content}</p>
          <p className="mt-2 text-sm text-[#50fa7b]">
            {new Date(post.createdAt).toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}
`,
    "src/app/globals.css": `
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --foreground-rgb: 238, 238, 238;
  --background-start-rgb: 30, 30, 30;
  --background-end-rgb: 40, 40, 40;
  --accent-color: 97, 175, 239;
  --secondary-accent: 152, 195, 121;
  --tertiary-accent: 229, 192, 123;
}

@media (prefers-color-scheme: dark) {
  :root {
    --foreground-rgb: 255, 255, 255;
    --background-start-rgb: 0, 0, 0;
    --background-end-rgb: 0, 0, 0;
  }
}

body {
  color: rgb(var(--foreground-rgb));
  background: linear-gradient(
    to bottom right,
    rgb(var(--background-start-rgb)),
    rgb(var(--background-end-rgb))
  );
  min-height: 100vh;
}

@layer utilities {
  .text-balance {
    text-wrap: balance;
  }
}
`,
  });

  // Create README.md
  const readmeContent = `# ${appName}

This is a monorepo project created with k4-cli.

## Getting Started

To boot up the project for the first time:

1. Start the development environment:
   \`\`\`
   pnpm dev
   \`\`\`
   This command will start Docker containers and all the apps.

2. Once Docker is up, migrate the database:
   \`\`\`
   pnpm db migrate dev
   \`\`\`

## Useful Commands

- \`pnpm dev\`: Start the development environment
- \`pnpm build\`: Build all packages and apps
- \`pnpm check-types\`: Run type checking for all packages and apps
- \`pnpm db\`: Run Prisma commands for the db package
- \`pnpm db:reset\`: Reset the database and run migrations

## Project Structure

- \`apps/\`: Contains all the applications
  - \`web/\`: Next.js web application
  - \`worker/\`: Node.js worker application
- \`packages/\`: Contains shared packages
  - \`db/\`: Database package with Prisma setup
  - \`queue/\`: Queue package for background jobs
  - \`typescript-config/\`: Shared TypeScript configuration

## Adding New Apps or Packages

To add a new app or package to the monorepo, use the following command:

\`\`\`
k4 app <name> [--next | --node]
\`\`\`

This will create a new app in the \`apps/\` directory with the necessary configuration.

## Learn More

To learn more about the technologies used in this project:

- [Turborepo](https://turbo.build/repo)
- [pnpm](https://pnpm.io)
- [Next.js](https://nextjs.org/docs)
- [Prisma](https://www.prisma.io/docs/)
- [BullMQ](https://docs.bullmq.io/)
`;

  fs.writeFileSync("README.md", readmeContent);

  // Run build script for db package
  console.log("Building db package...");
  execSync("pnpm turbo run build --filter=@repo/db --ui stream", {
    stdio: "inherit",
    cwd: process.cwd(),
  });

  console.log(`Monorepo ${appName} initialized successfully!`);
};

const initializeApp = async (name: string, type?: string) => {
  if (!type) {
    type = await select({
      message: "What type of app do you want to create?",
      choices: [
        { name: "Next.js", value: "next" },
        { name: "Node.js", value: "node" },
      ],
    });
  }

  const appDir = path.join("apps", name);
  fs.mkdirSync(appDir, { recursive: true });

  switch (type) {
    case "next":
      createNextApp(name);
      break;
    case "node":
      createNodeApp(name, {
        "src/index.ts": 'console.log("Hello, World!");',
      });
      break;
  }

  console.log(`App ${name} initialized successfully!`);
};

program
  .name("k4")
  .description("CLI to bootstrap and manage pnpm/turborepo monorepos")
  .version("0.1.0");

program
  .command("init <name>")
  .description("Initialize a new monorepo")
  .action(initializeMonorepo);

program
  .command("app <name>")
  .description("Initialize a new app in the monorepo")
  .option("--next", "Create a Next.js app")
  .option("--node", "Create a Node.js app")
  .action((name, options) => {
    const type = options.next ? "next" : options.node ? "node" : undefined;
    initializeApp(name, type);
  });

program.parse();
