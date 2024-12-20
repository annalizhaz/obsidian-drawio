# Draw.io / Diagrams.net for Obsidian
## Overview
This repository contains the source code for a plugin that integrates the [Draw.io](https://draw.io) / [Diagrams.net](https://diagrams.net) diagramming tool into the [Obsidian](https://obsidian.md) knowledge management application. The plugin allows users to create and edit diagrams within Obsidian, enhancing the note-taking experience.
## Features
- **Diagram Creation**: Create and edit diagrams directly within Obsidian.
- **Integration**: Seamless integration with Obsidian's note-taking system.
- **Customizable**: Configure settings to suit your workflow.
- **Export**: Export diagrams to various formats.
- **Import**: Import diagrams from various sources.
## Installation
1. Clone the repository: `git clone https://github.com/your-username/obsidian-drawio.git`
2. Navigate to the project directory: `cd obsidian-drawio`
3. Modify the deploy-config.template.js to reflect the location of your Obsidian vault and your operating system.
4. Copy the deploy-config.template.js to deploy-config.js via the commandline: `cp deploy-config.template.js deploy-config.js`
5. Install the dependencies: `npm install`
6. To build the plugin, run `npm run build`
7. To deploy the plugin to your plugin directory specified earlier, run `npm run deploy`
Note: `npm run clean-install` will delete the files created during installation before running the install, `npm run clean-build` will delete the build files before running the build. and `npm run clean-deploy` will run a clean install and clean build before deploying.
## Usage
1. Open Obsidian and navigate to Community Plugins within the settings.
2. Enable "Draw.io Integration" plugin under the "Insalled" heading (you may need to refresh the available plugins list).
3. Configure the plugin according to your preferences.
4. Start creating and editing diagrams within Obsidian.
## Configuration
The plugin allows you to customize the default folder for new diagrams (where they go when you aren't in a folder already) and the default theme for new diagrams.
## Acknowledgments
- [Draw.io](https://draw.io) / [Diagrams.net](https://diagrams.net)
- [Obsidian
](https://obsidian.md)
- [Obsidian Community](https://obsidian.md/community)
## File Structure
```
obsidian-drawio/
├── src/
│   └── main.ts                 # Main plugin implementation
├── rollup.config.js            # Rollup configuration for bundling
├── manifest.json               # Plugin manifest with metadata
├── package.json                # Project dependencies and scripts
├── tsconfig.json               # TypeScript configuration
├── data.json                   # Plugin configuration
├── version.json                # Plugin version information
├── deploy-config.template.js   # Configuration template for deployment
├── deploy-config.js            # Configuration for deployment
├── deploy.js                   # Deployment script
├── .gitignore                  # Git ignore rules
└── README.md                   # Project documentation
```