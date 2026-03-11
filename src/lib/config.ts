import { existsSync, readdirSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, basename } from "node:path";

export interface ProjectConfig {
  name: string;
  path: string;
  composeFile: string;
}

interface RawConfig {
  scan?: string[];
  projects?: Array<{ name?: string; path: string }>;
}

const COMPOSE_FILENAMES = ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"];
const DEFAULT_STACKS_SCAN_PATH = "../stacks";

function findComposeFile(dir: string): string | null {
  for (const name of COMPOSE_FILENAMES) {
    const filePath = resolve(dir, name);
    if (existsSync(filePath)) return filePath;
  }
  return null;
}

function scanDirectory(dir: string): ProjectConfig[] {
  if (!existsSync(dir)) return [];

  const projects: ProjectConfig[] = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = resolve(dir, entry);
    try {
      if (!statSync(fullPath).isDirectory()) continue;
    } catch {
      continue;
    }

    const composeFile = findComposeFile(fullPath);
    if (composeFile) {
      projects.push({
        name: entry,
        path: fullPath,
        composeFile,
      });
    }
  }

  return projects;
}

const DEFAULT_CONFIG = `# Alfredo - Docker Compose project configuration
#
# scan: directories to scan for subdirectories containing docker-compose.yml / compose.yml
# projects: explicit project paths (override scanned ones)

scan:
  - ${DEFAULT_STACKS_SCAN_PATH}

# projects:
#   - name: My Redis
#     path: /opt/apps/redis
#   - path: /opt/apps/postgres
`;

export function getDefaultStacksDirectory(): string {
  return resolve(DEFAULT_STACKS_SCAN_PATH);
}

export function ensureDefaultStacksDirectory(): string {
  const stacksDir = getDefaultStacksDirectory();
  mkdirSync(stacksDir, { recursive: true });
  return stacksDir;
}

export function loadConfig(): RawConfig {
  const configPath = resolve("config.yaml");
  if (!existsSync(configPath)) {
    writeFileSync(configPath, DEFAULT_CONFIG);
    const stacksDir = ensureDefaultStacksDirectory();
    console.log(`Generated config.yaml and stacks directory at ${stacksDir}.`);
  }

  try {
    const text = Bun.file(configPath).textSync();
    return (Bun as any).YAML.parse(text) || {};
  } catch (e: any) {
    console.error(`Failed to parse config.yaml: ${e.message}`);
    return { scan: [], projects: [] };
  }
}

export function discoverProjects(): ProjectConfig[] {
  const config = loadConfig();
  const byPath = new Map<string, ProjectConfig>();
  const scanDirs = new Set<string>((config.scan || []).map((dir) => resolve(dir)));

  // Always include the default stacks directory to support UI-created stacks.
  scanDirs.add(getDefaultStacksDirectory());

  // Scan directories
  for (const dir of scanDirs) {
    for (const project of scanDirectory(dir)) {
      byPath.set(project.path, project);
    }
  }

  // Explicit projects (override scanned ones)
  for (const proj of config.projects || []) {
    const fullPath = resolve(proj.path);
    const composeFile = findComposeFile(fullPath);
    if (!composeFile) {
      console.warn(`No compose file found in ${fullPath}, skipping.`);
      continue;
    }
    byPath.set(fullPath, {
      name: proj.name || basename(fullPath),
      path: fullPath,
      composeFile,
    });
  }

  return Array.from(byPath.values()).sort((a, b) => a.name.localeCompare(b.name));
}

// Cached project list, refreshable
let cachedProjects: ProjectConfig[] = [];

export function getProjects(): ProjectConfig[] {
  if (cachedProjects.length === 0) refreshProjects();
  return cachedProjects;
}

export function refreshProjects(): ProjectConfig[] {
  cachedProjects = discoverProjects();
  return cachedProjects;
}

export function findProject(name: string): ProjectConfig | undefined {
  return getProjects().find((p) => p.name === name);
}
