# CX Programming Language

Language support for the CX programming language.

## Features

- Syntax highlighting for CX source files (`.cx`)
- Line (`//`) and block (`/* ... */`) comment toggling
- Automatic bracket, quote, and block-comment pairing
- Code folding for indented blocks and `// region` / `// endregion` markers
- Automatic indentation for bracketed blocks
- Build, run, and debug commands for the active `.cx` file
- Native debugging on Windows with MSVC, including CX source breakpoints,
  primitive locals, and basic class field inspection with generated runtime
  fields hidden from the normal object view

## Build, run, and debug in VS Code

Open and save a `.cx` file or executable `.cxproj` project, then use the Command
Palette commands **CX: Build Current File**, **CX: Run Current File**, or **CX:
Debug Current File**. The shortcuts are **F5** to debug and **Ctrl+F5** to run
without debugging. The extension builds with the `Debug` configuration and
shows compiler diagnostics in the Problems panel. Running launches the resulting
native executable in a VS Code task terminal.

Set `cx.compilerPath` if `cxc` is not on `PATH`. Set `cx.cxcoreDirectory` if the
compiler cannot find the `cxcore` checkout. CMake and a native C toolchain must
also be available. Set `cx.programArguments`, `cx.environment`, and
`cx.workingDirectory` in workspace settings to configure program execution.
Debugging currently uses the Microsoft C/C++ extension and its Windows/MSVC
debugger. Native debug symbols map generated C statements back to CX source
locations; primitive locals and basic class fields can be inspected. The
compiler generates a Natvis file for CX classes so normal object expansion
shows CX fields without generated base/runtime fields. The debugger's Raw View
still exposes the generated C layout. Rich displays for strings, arrays,
interfaces, and arbitrary watch expressions are not included yet. Project
files must declare `type: Executable` to run or debug.

The following optional workspace configuration shows how to use VS Code tasks
and a launch profile directly instead of the extension commands. Put it in
`.vscode/tasks.json` and `.vscode/launch.json` beside a single `.cx` file.

`.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "CX: Build Debug",
      "type": "process",
      "command": "${config:cx.compilerPath}",
      "args": [
        "--compile",
        "--configuration",
        "Debug",
        "--verbosity",
        "verbose",
        "${file}"
      ],
      "options": { "cwd": "${fileDirname}" },
      "problemMatcher": {
        "owner": "cx",
        "fileLocation": ["absolute"],
        "pattern": {
          "regexp": "^(.*)\\((\\d+),(\\d+)\\): (error|warning): (.*)$",
          "file": 1,
          "line": 2,
          "column": 3,
          "severity": 4,
          "message": 5
        }
      },
      "group": { "kind": "build", "isDefault": true }
    },
    {
      "label": "CX: Run Current File",
      "type": "process",
      "command": "${fileDirname}/.bin/Debug/${fileBasenameNoExtension}.exe",
      "options": { "cwd": "${fileDirname}" },
      "dependsOn": "CX: Build Debug",
      "dependsOrder": "sequence",
      "problemMatcher": []
    }
  ]
}
```

`.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug CX Current File (Windows/MSVC)",
      "type": "cppvsdbg",
      "request": "launch",
      "program": "${fileDirname}/.bin/Debug/${fileBasenameNoExtension}.exe",
      "args": [],
      "cwd": "${fileDirname}",
      "preLaunchTask": "CX: Build Debug",
      "visualizerFile": "${fileDirname}/.obj/${fileBasenameNoExtension}.natvis",
      "externalConsole": false
    }
  ]
}
```

The direct launch profile currently targets the Visual Studio C/C++ debugger on
Windows. Cross-platform native debug profiles still need work.

## Release Notes

### 0.0.1

Initial TextMate grammar and basic editing support.
