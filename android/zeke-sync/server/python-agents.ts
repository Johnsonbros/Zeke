import { spawn, ChildProcess } from "child_process";
import { log } from "./logger";

let pythonProcess: ChildProcess | null = null;
let isShuttingDown = false;

export function startPythonAgents(): void {
  if (pythonProcess !== null) {
    log("Python agents already running", "python-agents");
    return;
  }
  
  const pythonPath = process.env.PYTHONPATH || "/home/runner/workspace";
  
  log("Starting Python agents service...", "python-agents");
  
  pythonProcess = spawn(
    "python",
    ["-m", "uvicorn", "python_agents.main:app", "--host", "127.0.0.1", "--port", "5001"],
    {
      env: {
        ...process.env,
        PYTHONPATH: pythonPath,
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  
  pythonProcess.stdout?.on("data", (data) => {
    const output = data.toString().trim();
    if (output) {
      log(output, "python-agents");
    }
  });
  
  pythonProcess.stderr?.on("data", (data) => {
    const output = data.toString().trim();
    if (output && !output.includes("INFO:")) {
      log(`stderr: ${output}`, "python-agents");
    }
  });
  
  pythonProcess.on("error", (error) => {
    log(`Failed to start: ${error.message}`, "python-agents");
    pythonProcess = null;
  });
  
  pythonProcess.on("exit", (code, signal) => {
    if (!isShuttingDown) {
      log(`Process exited with code ${code}, signal ${signal}`, "python-agents");
      pythonProcess = null;
      
      setTimeout(() => {
        if (!isShuttingDown) {
          log("Attempting to restart...", "python-agents");
          startPythonAgents();
        }
      }, 5000);
    }
  });
}

export function stopPythonAgents(): void {
  isShuttingDown = true;
  if (pythonProcess !== null) {
    log("Stopping Python agents service...", "python-agents");
    pythonProcess.kill("SIGTERM");
    pythonProcess = null;
  }
}

export async function waitForPythonAgents(timeoutMs: number = 30000): Promise<boolean> {
  const startTime = Date.now();
  const checkInterval = 500;
  
  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch("http://127.0.0.1:5001/health", {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        log("Python agents service is ready", "python-agents");
        return true;
      }
    } catch {
    }
    await new Promise((resolve) => setTimeout(resolve, checkInterval));
  }
  
  log(`Timeout waiting for Python agents after ${timeoutMs}ms`, "python-agents");
  return false;
}

process.on("SIGTERM", stopPythonAgents);
process.on("SIGINT", stopPythonAgents);
process.on("exit", stopPythonAgents);
