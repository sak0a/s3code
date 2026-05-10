export function readEnv(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env[name];
  return typeof value === "string" ? value : undefined;
}

export function setEnv(env: NodeJS.ProcessEnv, name: string, value: string | undefined): void {
  if (value === undefined) {
    delete env[name];
  } else {
    env[name] = value;
  }
}

export function deleteEnv(env: NodeJS.ProcessEnv, name: string): void {
  delete env[name];
}
