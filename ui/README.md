# Fedi UI

The Fedi UI codebase is a Yarn workspace that's split between 3 projects:

|              |                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| `common`     | Shared constants, utilities, and types between all clients                                               |
| `injections` | A set of scripts that can be injected into webviews to provide WebLN, NIP-07, or any other functionality |
| `native`     | A `react-native` based native app for Android and iOS                                                    |
| `web`        | A `next` based progressive web app for desktop and mobile web                                            |

## Development Environment: Nix

We use [Nix](https://nixos.org/download.html), a powerful package manager for Linux and other Unix systems, for managing our development environment. This ensures that we all work in a consistent environment that's easy to set up.

You can follow the [Fedimint Nix setup docs](https://github.com/fedimint/fedimint/blob/master/docs/dev-env.md#set-up-nix) to prepare your environment.

After the installation is complete, you may need to close and reopen your terminal for the changes to take effect.

### Starting a Development Session

Before you start working, you should enter a Nix development shell. This sets up your environment with all the dependencies you need for development.

To enter a Nix development shell, navigate to the project root directory and run:

```bash
nix develop
```

You should do this in every new terminal session where you plan to run our development tasks.

Note: Whenever you see a command that starts with `just`, make sure you've run `nix develop` in the terminal where you're running the command.

### Running the Development UI

We use a command runner called [Just](https://github.com/casey/just) to manage our development tasks. The `run-dev-ui` command is used to start the development UI (both native and PWA).

#### Basic Usage

The `run-dev-ui` command can be run with the default settings like this:

```bash
just run-dev-ui
```

This will start the development UI with the default mode and settings. It does not prompt for any build options.

#### Interactive Mode

To start the development UI in interactive mode, which prompts for build options, use the `interactive` mode:

```bash
just run-dev-ui interactive
```

In interactive mode, the script will ask whether to skip reinstalling node modules and rebuilding the bridge. You can respond with `y` (yes) or `n` (no) to each prompt.

#### Passing options directly

You can also choose to skip rebuilding the bridge without using interactive mode by setting the `BUILD_BRIDGE` environment variable:

```bash
BUILD_BRIDGE=0 just run-dev-ui
```

## Workspace Details

If you already have common development tools like Node/Yarn you can try using a non-Nix development setup, but this is not recommended.

### Dependencies

Prefer yarn over npm to install dependencies

```bash
# Install dependencies
yarn install
```

### Running commands

Running commands in the `ui/` directory will run those commands in all directories.
This is the most convenient way to develop on the UI, ensuring that any changes
made to any package is considered across any package that may be using it.

```bash
# Starts development servers for web and native, compilation watcher for common
yarn dev

# Lints all packages
yarn lint
```

Alternatively, you can either run individual package commands by `cd`ing into the
correct directory and running them there, or you can use `yarn workspace` to target
a specific package.

```bash
# Doing this...
cd web
yarn dev

# Is the same as this
yarn workspace @fedi/web dev
```

### Adding new packages

To install a new package, go to each project that needs it and run `yarn add ...`
for the package in each. For packages that are shared across multiple projects,
please try to keep the versions synchronized between all projects. You can check
if they're synced by running:

```bash
yarn run syncpack
```

If there are any mismatches, you can fix that by running

```bash
yarn run syncpack fix-mismatches
```

which will upgrade all projects to use the highest version of the dependency.

#### Hoisting

All packages are hoisted up into `ui/node_modules`, even if only a
single module uses them.
