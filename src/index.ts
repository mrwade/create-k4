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
      lint: "eslint .",
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
  clean: true,
  sourcemap: true,
});
`;
  fs.writeFileSync(path.join(packageDir, "tsup.config.ts"), tsupConfig);

  Object.entries(files).forEach(([filePath, content]) => {
    const fullPath = path.join(packageDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  });

  createEslintConfig(packageDir);

  console.log(`Installing dependencies for ${packageName} package...`);
  execSync(
    "pnpm add -D tsup typescript @repo/typescript-config@workspace:* @repo/eslint-config@workspace:*",
    {
      stdio: "inherit",
      cwd: packageDir,
    }
  );
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
      lint: "eslint .",
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
  clean: true,
  sourcemap: true,
});
`;
  fs.writeFileSync(path.join(appDir, "tsup.config.ts"), tsupConfig);

  Object.entries(files).forEach(([filePath, content]) => {
    const fullPath = path.join(appDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  });

  createEslintConfig(appDir);

  console.log(`Installing dependencies for ${name} app...`);
  execSync(
    "pnpm add @repo/typescript-config@workspace:* @repo/db@workspace:* @repo/queue@workspace:* @repo/eslint-config@workspace:*",
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
    `npx create-next-app@latest ${appDir} --typescript --eslint --tailwind --app --src-dir --import-alias "@/*" --use-pnpm --disable-git`,
    { stdio: "inherit" }
  );

  // Delete .git directory created by create-next-app
  // The --disable-git flag is new and not released yet
  const gitDir = path.join(appDir, ".git");
  if (fs.existsSync(gitDir)) {
    console.log(`Removing .git directory from ${name} app...`);
    fs.rmSync(gitDir, { recursive: true, force: true });
  }

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

const createEslintConfigPackage = () => {
  const packageDir = path.join("packages", "eslint-config");
  fs.mkdirSync(packageDir, { recursive: true });

  const packageJson = {
    name: "@repo/eslint-config",
    version: "0.1.0",
    private: true,
    type: "module",
    exports: {
      "./node": "./node.js",
    },
  };
  fs.writeFileSync(
    path.join(packageDir, "package.json"),
    JSON.stringify(packageJson, null, 2)
  );

  const eslintConfig = `
import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  {files: ["**/*.{js,mjs,cjs,ts}"]},
  {languageOptions: { globals: globals.node }},
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
];
`;
  fs.writeFileSync(path.join(packageDir, "node.js"), eslintConfig);

  console.log("Installing dependencies for eslint-config package...");
  execSync("pnpm install @eslint/js typescript-eslint eslint globals", {
    stdio: "inherit",
    cwd: packageDir,
  });
};

const createEslintConfig = (dir: string) => {
  const eslintConfig = `
import nodeConfig from "@repo/eslint-config/node";

export default [...nodeConfig, { ignores: ["dist/"] }];
`.trim();
  fs.writeFileSync(path.join(dir, "eslint.config.js"), eslintConfig);
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
      "db:init": "pnpm db migrate dev --name init",
      "db:reset": "pnpm docker-dev db:reset && pnpm db migrate dev",
      dev: "turbo run dev",
      "docker-dev": "pnpm --filter @repo/docker-dev",
      format: "prettier --write .",
      lint: "turbo run lint",
      test: "turbo run test",
    },
  };
  fs.writeFileSync("package.json", JSON.stringify(packageJson, null, 2));

  // Install workspace dependencies
  console.log("Installing workspace dependencies...");
  execSync("pnpm add -w -D @types/node prettier turbo typescript", {
    stdio: "inherit",
  });

  // Add prettier
  fs.writeFileSync(".prettierrc", "{}");
  fs.writeFileSync(".prettierignore", "pnpm-lock.yaml");

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
      lint: {
        dependsOn: ["^lint"],
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

  // Create .vscode/settings.json file
  const vscodeSettings = {
    "typescript.tsdk": "node_modules/typescript/lib",
  };
  fs.mkdirSync(".vscode", { recursive: true });
  fs.writeFileSync(
    ".vscode/settings.json",
    JSON.stringify(vscodeSettings, null, 2)
  );

  // Create eslint-config package
  createEslintConfigPackage();

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
  userId    String   @db.VarChar(12) @map("user_id")
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
  // eslint-disable-next-line no-var
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
          className="bg-[#4a5a8a] hover:bg-[#3a4a7a] text-[#e6e6eb] font-bold py-2 px-4 rounded-md shadow-lg transition duration-300"
        >
          Generate Posts
        </button>
      </form>

      {posts.map((post) => (
        <div
          key={post.id}
          className="bg-[#1a1a2a] shadow-lg rounded-md p-4 mb-4 border border-[#3a4a7a]"
        >
          <p className="font-bold text-[#a0b0ff]">@{post.user.username}</p>
          <p className="mt-2 text-[#dcdceb]">{post.content}</p>
          <p className="mt-2 text-sm text-[#8090c0]">
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
  --background-start-rgb: 25, 25, 35;
  --background-end-rgb: 35, 35, 50;
}

@media (prefers-color-scheme: dark) {
  :root {
    --foreground-rgb: 255, 255, 255;
    --background-start-rgb: 0, 0, 0;
    --background-end-rgb: 0, 0, 0;
  }
}

html,
body {
  background-color: rgb(var(--background-start-rgb));
}

body {
  color: rgb(220, 220, 235);
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

This is a monorepo project created with create-k4.

## Getting Started

To boot up the project for the first time:

1. Start the development environment:
   \`\`\`
   pnpm dev
   \`\`\`
   This command will start Docker containers and all the apps.

2. Once Docker is up, create the initial migration and migrate the database:
   \`\`\`
   pnpm db:init
   \`\`\`

3. Open the web app: http://localhost:3000

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
  - \`eslint-config/\`: Shared ESLint configuration
  - \`typescript-config/\`: Shared TypeScript configuration

## Adding New Apps or Packages

To add a new app or package to the monorepo, use the following command:

\`\`\`
create-k4 app <name> [--next | --node]
\`\`\`

This will create a new app in the \`apps/\` directory with the necessary configuration.

## Learn More

To learn more about the technologies used in this project:

- [Turborepo](https://turbo.build/repo)
- [pnpm](https://pnpm.io)
- [Next.js](https://nextjs.org/docs)
- [Prisma](https://www.prisma.io/docs/)
- [BullMQ](https://docs.bullmq.io/)
- [ESLint](https://eslint.org/)
- [Prettier](https://prettier.io/)
- [TypeScript](https://www.typescriptlang.org/)
`;

  fs.writeFileSync("README.md", readmeContent);

  // Run build script for db package
  console.log("Building db package...");
  execSync("pnpm turbo run build --filter=@repo/db --ui stream", {
    stdio: "inherit",
    cwd: process.cwd(),
  });

  // Format all files
  console.log("Formatting all files...");
  execSync("pnpm format", { stdio: "inherit" });

  // Initialize git repository
  console.log("Initializing git repository...");
  execSync("git init", { stdio: "inherit" });
  execSync("git add .", { stdio: "inherit" });
  execSync('git commit -m "Initial commit"', { stdio: "inherit" });

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
  .name("create-k4")
  .description("CLI to bootstrap and manage pnpm/turborepo monorepos")
  .version("1.0.0");

program
  .argument("<name>", "Name of the monorepo")
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
