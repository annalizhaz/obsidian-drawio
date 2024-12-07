import { 
    App,
    Plugin, 
    MarkdownView, 
    TFile, 
    Notice,
    PluginSettingTab,
    Setting,
    WorkspaceLeaf,
    TFolder,
    Menu
} from 'obsidian';

interface DrawioPluginSettings {
    theme: 'system' | 'light' | 'dark';
    defaultFolder: string;
}

const DEFAULT_SETTINGS: DrawioPluginSettings = {
    theme: 'system',
    defaultFolder: 'Diagrams'
};

export default class DrawioPlugin extends Plugin {
    settings: DrawioPluginSettings;
    private systemDarkModeQuery: MediaQueryList;

    async onload() {
        await this.loadSettings();

        // Initialize system theme detection
        this.systemDarkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
        this.systemDarkModeQuery.addListener(this.handleSystemThemeChange.bind(this));

        // Register custom view for .drawio files
        this.registerView(
            'drawio-view',
            (leaf) => new DrawioView(leaf, this)
        );

        // Add ribbon icon with a valid Obsidian icon
        this.addRibbonIcon('workflow', 'New Draw.io Diagram', () => {
            this.createNewDiagram();
        });

        // Add command to create new diagram
        this.addCommand({
            id: 'create-new-diagram',
            name: 'Create new Draw.io diagram',
            callback: () => {
                this.createNewDiagram();
            }
        });

        // Register folder menu event
        this.registerEvent(
            this.app.workspace.on('file-menu', (menu, file) => {
                if (file instanceof TFolder) {
                    menu.addItem((item) => {
                        item
                            .setTitle('New Draw.io Diagram')
                            .setIcon('workflow')
                            .onClick(async () => {
                                await this.createNewDiagram(file.path);
                            });
                    });
                }
            })
        );

        // Register view type for .drawio extension
        this.registerExtensions(['drawio'], 'drawio-view');

        // Add settings tab
        this.addSettingTab(new DrawioSettingTab(this.app, this));
    }

    onunload() {
        this.systemDarkModeQuery.removeListener(this.handleSystemThemeChange.bind(this));
    }

    private async ensureDefaultFolderExists(): Promise<string> {
        const folderPath = this.settings.defaultFolder;
        
        if (!folderPath) {
            return '';
        }

        // Check if folder exists
        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        
        if (!folder) {
            // Create folder if it doesn't exist
            try {
                await this.app.vault.createFolder(folderPath);
                new Notice(`Created default diagrams folder: ${folderPath}`);
            } catch (error) {
                console.error('Error creating default folder:', error);
                new Notice('Error creating default folder');
                return '';
            }
        }

        return folderPath;
    }

    private handleSystemThemeChange() {
        // Notify all open Draw.io views to update their theme
        this.app.workspace.iterateAllLeaves(leaf => {
            if (leaf.view instanceof DrawioView) {
                leaf.view.updateTheme();
            }
        });
    }

    getCurrentTheme(): 'dark' | 'light' {
        if (this.settings.theme === 'system') {
            return this.systemDarkModeQuery.matches ? 'dark' : 'light';
        }
        return this.settings.theme;
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        // Update theme for all open Draw.io views
        this.app.workspace.iterateAllLeaves(leaf => {
            if (leaf.view instanceof DrawioView) {
                leaf.view.updateTheme();
            }
        });
    }

    private EMPTY_DIAGRAM = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="Electron" modified="2024-12-07T12:00:00.000Z" agent="Obsidian Draw.io" version="21.1.2">
  <diagram id="default-diagram" name="Page-1">
    <mxGraphModel dx="1422" dy="794" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

    async createNewDiagram(targetFolderPath?: string) {
        try {
            // Determine target folder
            let folderPath = '';
            
            if (targetFolderPath) {
                // Use explicitly provided folder path (for right-click menu)
                folderPath = targetFolderPath;
            } else {
                // Try to get current folder context from active file
                const activeLeaf = this.app.workspace.activeLeaf;
                const activeView = activeLeaf?.view;
                
                if (activeView instanceof MarkdownView && activeView.file?.parent) {
                    // If we have an active file, use its parent folder
                    folderPath = activeView.file.parent.path;
                } else {
                    // Check if we're in a file explorer view
                    const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0];
                    if (fileExplorer && fileExplorer.view) {
                        // Get the currently visible folder in the file explorer
                        // @ts-ignore - Accessing internal API
                        const currentFolder = fileExplorer.view.openFolder;
                        if (currentFolder) {
                            folderPath = currentFolder.path;
                        }
                    }
                }
                
                // If still no folder path, use default folder
                if (!folderPath) {
                    folderPath = await this.ensureDefaultFolderExists();
                }
            }
            
            // Generate unique filename with path
            const fileName = `${folderPath ? folderPath + '/' : ''}diagram-${Date.now()}.drawio`;
            
            // Create file with empty diagram template
            const newFile = await this.app.vault.create(fileName, this.EMPTY_DIAGRAM);
            
            // Create new leaf in the current window
            const leaf = this.app.workspace.getLeaf(true);
            
            // Ensure the leaf is ready
            if (!(leaf instanceof WorkspaceLeaf)) {
                throw new Error('Could not create new leaf');
            }
            
            // Set the view to our drawio-view and open the file
            await leaf.setViewState({
                type: 'drawio-view',
                state: {
                    file: newFile.path
                }
            });
            
            // Ensure the new leaf is active
            this.app.workspace.setActiveLeaf(leaf, { focus: true });
            
            new Notice('New diagram created and opened');
            
        } catch (error) {
            console.error('Error creating new diagram:', error);
            new Notice('Error creating new diagram');
        }
    }
}

class DrawioView extends MarkdownView {
    private iframe: HTMLIFrameElement;
    private hasUnsavedChanges: boolean = false;
    plugin: DrawioPlugin;

    constructor(leaf: any, plugin: DrawioPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    async onOpen() {
        const currentTheme = this.plugin.getCurrentTheme();
        this.iframe = document.createElement('iframe');
        this.iframe.style.width = '100%';
        this.iframe.style.height = '100%';
        this.iframe.style.border = 'none';
        
        // Updated configuration parameters with theme
        this.iframe.src = 'https://embed.diagrams.net/?' + new URLSearchParams({
            embed: '1',
            spin: '1',
            modified: 'unsavedChanges',
            proto: 'json',
            saveAndExit: '0',
            noExitBtn: '1',
            ui: currentTheme
        });

        this.contentEl.empty();
        this.contentEl.appendChild(this.iframe);

        window.addEventListener('message', this.handleMessage.bind(this));
        
        window.addEventListener('beforeunload', (e) => {
            if (this.hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
    }

    updateTheme() {
        const currentTheme = this.plugin.getCurrentTheme();
        // Send theme update message to Draw.io
        this.iframe?.contentWindow?.postMessage(JSON.stringify({
            action: 'theme',
            value: currentTheme
        }), '*');
    }

    private async handleMessage(event: MessageEvent) {
        if (event.origin !== 'https://embed.diagrams.net') return;

        try {
            const message = JSON.parse(event.data);

            switch (message.event) {
                case 'init':
                    await this.loadDiagram();
                    break;
                    
                case 'save':
                    await this.saveDiagram(message.xml);
                    this.hasUnsavedChanges = false;
                    new Notice('Diagram saved successfully');
                    break;
                    
                case 'exit':
                    if (this.hasUnsavedChanges) {
                        if (confirm('You have unsaved changes. Save before closing?')) {
                            this.iframe.contentWindow?.postMessage(JSON.stringify({
                                action: 'save'
                            }), '*');
                        }
                    }
                    break;
                    
                case 'modified':
                    this.hasUnsavedChanges = true;
                    break;
            }
        } catch (error) {
            console.error('Error handling Draw.io message:', error);
            new Notice('Error handling Draw.io operation');
        }
    }

    private async loadDiagram() {
        try {
            if (!this.file) return;
            
            const file = this.app.vault.getAbstractFileByPath(this.file.path);
            if (file instanceof TFile) {
                const content = await this.app.vault.read(file);
                if (content) {
                    this.iframe.contentWindow?.postMessage(JSON.stringify({
                        action: 'load',
                        xml: content,
                        autosave: 1
                    }), '*');
                } else {
                    this.iframe.contentWindow?.postMessage(JSON.stringify({
                        action: 'blank'
                    }), '*');
                }
            }
        } catch (error) {
            console.error('Error loading diagram:', error);
            new Notice('Error loading diagram');
        }
    }

    private async saveDiagram(xml: string) {
        try {
            if (!this.file) return;
            
            const file = this.app.vault.getAbstractFileByPath(this.file.path);
            if (file instanceof TFile) {
                await this.app.vault.modify(file, xml);
            }
        } catch (error) {
            console.error('Error saving diagram:', error);
            new Notice('Error saving diagram');
            throw error;
        }
    }

    async onClose() {
        window.removeEventListener('message', this.handleMessage.bind(this));
    }
}

class DrawioSettingTab extends PluginSettingTab {
    plugin: DrawioPlugin;

    constructor(app: App, plugin: DrawioPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Theme')
            .setDesc('Choose the editor theme (system follows your OS setting)')
            .addDropdown(dropdown => dropdown
                .addOption('system', 'System')
                .addOption('light', 'Light')
                .addOption('dark', 'Dark')
                .setValue(this.plugin.settings.theme)
                .onChange(async (value: 'system' | 'light' | 'dark') => {
                    this.plugin.settings.theme = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Default Folder')
            .setDesc('Default folder path for new diagrams when no folder is selected')
            .addText(text => text
                .setPlaceholder('Diagrams')
                .setValue(this.plugin.settings.defaultFolder)
                .onChange(async (value) => {
                    this.plugin.settings.defaultFolder = value;
                    await this.plugin.saveSettings();
                }));
    }
}