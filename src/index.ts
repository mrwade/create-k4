import { select } from "@inquirer/prompts";
import { execSync } from "child_process";
import { program } from "commander";
import fs from "fs-extra";
import path from "path";

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
  const packageJson = {
    name: appName,
    private: true,
    scripts: {
      build: "turbo run build",
      dev: "turbo run dev",
      lint: "turbo run lint",
      "check-types": "turbo run check-types",
      test: "turbo run test",
    },
    devDependencies: {
      turbo: "latest",
    },
  };
  fs.writeFileSync("package.json", JSON.stringify(packageJson, null, 2));

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
  fs.writeFileSync("turbo.json", JSON.stringify(turboConfig, null, 2));

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
  const dockerComposeConfig = `
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: ${appName.replace(/-/g, "_")}_dev
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

  if (type === "next") {
    execSync(
      `npx create-next-app@latest ${appDir} --typescript --eslint --use-pnpm`,
      { stdio: "inherit" }
    );
  } else if (type === "node") {
    // Initialize Node.js app
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

    // Create tsup.config.ts
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

    // Create tsconfig.json
    const tsConfig = {
      extends: "@repo/typescript-config/base.json",
    };
    fs.writeFileSync(
      path.join(appDir, "tsconfig.json"),
      JSON.stringify(tsConfig, null, 2)
    );

    // Create src/index.ts
    fs.mkdirSync(path.join(appDir, "src"));
    fs.writeFileSync(
      path.join(appDir, "src", "index.ts"),
      'console.log("Hello, World!");'
    );

    // Install dependencies including latest tsup and typescript
    console.log("Installing dependencies for the Node.js app...");
    execSync("pnpm add @repo/typescript-config@workspace:*", {
      stdio: "inherit",
      cwd: appDir,
    });
    execSync("pnpm add -D tsup typescript", {
      stdio: "inherit",
      cwd: appDir,
    });
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
