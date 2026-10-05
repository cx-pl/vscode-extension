const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

let taskSequence = 0;

function activeCxInput() {
  const document = vscode.window.activeTextEditor?.document;
  const extension = document ? path.extname(document.uri.fsPath).toLowerCase() : '';
  if (!document || !['.cx', '.cxproj'].includes(extension) || document.isUntitled) {
    void vscode.window.showErrorMessage('Open and save a .cx source file or .cxproj project first.');
    return undefined;
  }
  return document;
}

function projectInfo(document) {
  const inputPath = document.uri.fsPath;
  const extension = path.extname(inputPath).toLowerCase();
  if (extension === '.cx') {
    return { inputPath, directory: path.dirname(inputPath), name: path.basename(inputPath, extension) };
  }

  const contents = document.getText();
  const nameMatch = contents.match(/^\s*name\s*:\s*(?:"([^"]+)"|'([^']+)'|([^\s#]+))\s*(?:#.*)?$/im);
  const typeMatch = contents.match(/^\s*type\s*:\s*(?:"([^"]+)"|'([^']+)'|([^\s#]+))\s*(?:#.*)?$/im);
  const name = nameMatch && (nameMatch[1] || nameMatch[2] || nameMatch[3]);
  const type = typeMatch && (typeMatch[1] || typeMatch[2] || typeMatch[3]);
  if (!name) throw new Error('Could not read the project name from the .cxproj YAML file.');
  if (!type || type.toLowerCase() !== 'executable') {
    throw new Error(`Project '${name}' is not an executable project.`);
  }
  return { inputPath, directory: path.dirname(inputPath), name };
}

function buildTask(document, project) {
  const { inputPath, directory, name } = project;
  const configuration = vscode.workspace.getConfiguration('cx');
  const compilerPath = configuration.get('compilerPath', 'cxc');
  const cxcoreDirectory = configuration.get('cxcoreDirectory', '');
  const args = [
    '--compile',
    '--configuration', 'Debug',
    '--verbosity', 'verbose',
  ];
  if (cxcoreDirectory) args.push('--cxcore-dir', cxcoreDirectory);
  args.push(inputPath);

  const task = new vscode.Task(
    { type: 'cx', action: 'build', file: inputPath, sequence: ++taskSequence },
    vscode.workspace.getWorkspaceFolder(document.uri) ?? vscode.TaskScope.Workspace,
    `CX: Build ${name}`,
    'CX',
    new vscode.ProcessExecution(compilerPath, args, { cwd: directory }),
    ['$cx'],
  );
  task.group = vscode.TaskGroup.Build;
  task.presentationOptions = {
    reveal: vscode.TaskRevealKind.Always,
    panel: vscode.TaskPanelKind.Dedicated,
    clear: true,
  };
  return task;
}

function runTask(task) {
  return new Promise((resolve, reject) => {
    const subscription = vscode.tasks.onDidEndTaskProcess(event => {
      if (event.execution.task.name !== task.name) return;
      subscription.dispose();
      resolve(event.exitCode === 0);
    });
    vscode.tasks.executeTask(task).then(
      () => {},
      error => {
        subscription.dispose();
        reject(error);
      },
    );
  });
}

async function buildCurrentFile() {
  const document = activeCxInput();
  if (!document) return false;
  try {
    return await buildCurrentFileFor(document, projectInfo(document));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(message);
    return false;
  }
}

function executablePath(project) {
  const { directory, name } = project;
  const extension = process.platform === 'win32' ? '.exe' : '';
  const candidates = [
    path.join(directory, '.bin', 'Debug', `${name}${extension}`),
    path.join(directory, '.bin', `${name}${extension}`),
  ];
  return candidates.find(candidate => fs.existsSync(candidate));
}

function runExecutableTask(document, project, program) {
  const configuration = vscode.workspace.getConfiguration('cx');
  const configuredWorkingDirectory = configuration.get('workingDirectory', '');
  const cwd = configuredWorkingDirectory
    ? path.resolve(project.directory, configuredWorkingDirectory)
    : project.directory;
  const args = configuration.get('programArguments', []);
  const env = configuration.get('environment', {});
  const task = new vscode.Task(
    { type: 'cx', action: 'run', file: project.inputPath, sequence: ++taskSequence },
    vscode.workspace.getWorkspaceFolder(document.uri) ?? vscode.TaskScope.Workspace,
    `CX: Run ${project.name}`,
    'CX',
    new vscode.ProcessExecution(program, args, { cwd, env }),
  );
  task.presentationOptions = {
    reveal: vscode.TaskRevealKind.Always,
    panel: vscode.TaskPanelKind.Dedicated,
    clear: false,
  };
  return vscode.tasks.executeTask(task);
}

async function runCurrentFile() {
  const document = activeCxInput();
  if (!document) return;
  let project;
  try {
    project = projectInfo(document);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(message);
    return;
  }
  if (!(await buildCurrentFileFor(document, project))) return;
  const program = executablePath(project);
  if (!program) {
    void vscode.window.showErrorMessage('CX build completed, but the executable was not found under .bin.');
    return;
  }
  await runExecutableTask(document, project, program);
}

async function buildCurrentFileFor(document, project) {
  if (document.isDirty && !(await document.save())) return false;
  try {
    const succeeded = await runTask(buildTask(document, project));
    if (!succeeded) void vscode.window.showErrorMessage('CX build failed. See the task output and Problems panel.');
    return succeeded;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`Could not start the CX compiler: ${message}`);
    return false;
  }
}

async function debugCurrentFile() {
  if (process.platform !== 'win32') {
    void vscode.window.showErrorMessage('CX native debugging currently requires Windows and the Visual Studio C/C++ debugger.');
    return;
  }
  const document = activeCxInput();
  if (!document) return;
  let project;
  try {
    project = projectInfo(document);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(message);
    return;
  }
  if (!(await buildCurrentFileFor(document, project))) return;
  const program = executablePath(project);
  if (!program) {
    void vscode.window.showErrorMessage('CX build completed, but the executable was not found under .bin.');
    return;
  }
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  const configuration = vscode.workspace.getConfiguration('cx');
  const configuredWorkingDirectory = configuration.get('workingDirectory', '');
  const cwd = configuredWorkingDirectory
    ? path.resolve(project.directory, configuredWorkingDirectory)
    : project.directory;
  const args = configuration.get('programArguments', []);
  const env = configuration.get('environment', {});
  const visualizerFile = path.join(project.directory, '.obj', `${project.name}.natvis`);
  const started = await vscode.debug.startDebugging(folder, {
    name: `CX: Debug ${project.name}`,
    type: 'cppvsdbg',
    request: 'launch',
    program,
    args,
    cwd,
    environment: Object.entries(env).map(([key, value]) => ({ name: key, value })),
    stopAtEntry: false,
    externalConsole: false,
    ...(fs.existsSync(visualizerFile) ? { visualizerFile } : {}),
  });
  if (!started) void vscode.window.showErrorMessage('Could not start the native CX debug session.');
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('cx.buildCurrentFile', buildCurrentFile),
    vscode.commands.registerCommand('cx.runCurrentFile', runCurrentFile),
    vscode.commands.registerCommand('cx.debugCurrentFile', debugCurrentFile),
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
