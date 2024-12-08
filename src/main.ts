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
    ItemView,
    ViewStateResult
} from 'obsidian';

/**
 * Main plugin file for Draw.io integration with Obsidian.
 * Provides functionality to create, edit, and manage Draw.io diagrams within Obsidian.
 * 
 * Features:
 * - Create and edit Draw.io diagrams within Obsidian
 * - Theme synchronization with Obsidian/system
 * - Automatic saving and change tracking
 * - Custom folder management for new diagrams
 */

/**
 * Configuration interface for the Draw.io plugin.
 * Defines available settings that can be modified by users.
 */
interface DrawioPluginSettings {
    theme: 'system' | 'light' | 'dark';
    defaultFolder: string;
}

const DEFAULT_SETTINGS: DrawioPluginSettings = {
    theme: 'system',
    defaultFolder: 'Diagrams'
};

const VIEW_TYPE_DRAWIO = 'drawio-view';

/**
 * Main plugin class that handles core functionality, settings management,
 * and integration with Obsidian's API.
 * 
 * Manages:
 * - Plugin initialization and cleanup
 * - Settings management
 * - Theme detection and synchronization
 * - File creation and management
 * - View registration and handling
 */
export default class DrawioPlugin extends Plugin {
    settings: DrawioPluginSettings;
    private systemDarkModeQuery: MediaQueryList;

    /**
     * Loads plugin settings from storage and initializes core functionality.
     * Sets up event listeners, registers views, and configures UI elements.
     */
    async onload() {
        await this.loadSettings();

        // Initialize system theme detection
        this.systemDarkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
        this.systemDarkModeQuery.addListener(this.handleSystemThemeChange.bind(this));

        // Register custom view for .drawio files
        this.registerView(
            VIEW_TYPE_DRAWIO,
            (leaf) => new DrawioView(leaf, this)
        );

        // Add ribbon icon
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
        this.registerExtensions(['drawio'], VIEW_TYPE_DRAWIO);

        // Add settings tab
        this.addSettingTab(new DrawioSettingTab(this.app, this));
    }

    /**
     * Cleans up plugin resources and event listeners.
     */
    onunload() {
        this.systemDarkModeQuery.removeListener(this.handleSystemThemeChange.bind(this));
    }

    /**
     * Ensures the configured default folder exists, creating it if necessary.
     * @returns The path to the default folder, or empty string if creation fails
     */
    private async ensureDefaultFolderExists(): Promise<string> {
        const folderPath = this.settings.defaultFolder;
        
        if (!folderPath) {
            return '';
        }

        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        
        if (!folder) {
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


    /**
     * Handles system theme changes and updates all open Draw.io views.
     */
    private handleSystemThemeChange() {
        this.app.workspace.iterateAllLeaves(leaf => {
            if (leaf.view instanceof DrawioView) {
                leaf.view.updateTheme();
            }
        });
    }

    /**
     * Gets the current theme based on settings and system preferences.
     * @returns 'dark' or 'light' based on current settings and system state
     */
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
        this.app.workspace.iterateAllLeaves(leaf => {
            if (leaf.view instanceof DrawioView) {
                leaf.view.updateTheme();
            }
        });
    }

    /**
     * Template for new Draw.io diagrams.
     * Creates an empty diagram with default settings:
     * - Grid enabled
     * - Page view disabled (sketch mode)
     * - Default scaling and dimensions
     */
    private EMPTY_DIAGRAM = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="Electron" modified="2024-12-07T12:00:00.000Z" agent="Obsidian Draw.io" version="21.1.2">
  <diagram id="default-diagram" name="Page-1">
    <mxGraphModel dx="1422" dy="794" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="850" pageHeight="1100">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

    /**
     * Creates a new Draw.io diagram file.
     * @param targetFolderPath Optional path where the diagram should be created
     */
    async createNewDiagram(targetFolderPath?: string) {
        try {
            let folderPath = '';
            
            if (targetFolderPath) {
                folderPath = targetFolderPath;
            } else {
                const activeLeaf = this.app.workspace.activeLeaf;
                const activeView = activeLeaf?.view;
                
                if (activeView instanceof MarkdownView && activeView.file?.parent) {
                    folderPath = activeView.file.parent.path;
                } else {
                    const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0];
                    if (fileExplorer && fileExplorer.view) {
                        // @ts-ignore - Accessing internal API
                        const currentFolder = fileExplorer.view.openFolder;
                        if (currentFolder) {
                            folderPath = currentFolder.path;
                        }
                    }
                }
                
                if (!folderPath) {
                    folderPath = await this.ensureDefaultFolderExists();
                }
            }
            
            const fileName = `${folderPath ? folderPath + '/' : ''}diagram ${Date.now()}.drawio`;
            const newFile = await this.app.vault.create(fileName, this.EMPTY_DIAGRAM);
            const leaf = this.app.workspace.getLeaf(true);
            
            if (!(leaf instanceof WorkspaceLeaf)) {
                throw new Error('Could not create new leaf');
            }
            
            await leaf.setViewState({
                type: VIEW_TYPE_DRAWIO,
                state: {
                    file: newFile.path
                }
            });
            
            this.app.workspace.setActiveLeaf(leaf, { focus: true });
            new Notice('New diagram created');
            
        } catch (error) {
            console.error('Error creating new diagram:', error);
            new Notice('Error creating new diagram');
        }
    }
}

/**
 * Custom view class for handling Draw.io editor interface.
 * Manages communication between Obsidian and Draw.io, handles file operations,
 * and maintains editor state.
 */
class DrawioView extends ItemView {
    private iframe: HTMLIFrameElement;
    private hasUnsavedChanges: boolean = false;
    private lastSaveTime: number = 0;
    private file: TFile | null = null;
    plugin: DrawioPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: DrawioPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_DRAWIO;
    }

    getDisplayText(): string {
        return this.file?.basename || 'Draw.io Diagram';
    }

    async setFile(file: TFile) {
        this.file = file;
    }

    /**
     * Sets up the iframe containing the Draw.io editor and initializes event listeners.
     */
    async onOpen() {
        const currentTheme = this.plugin.getCurrentTheme();
        this.iframe = document.createElement('iframe');
        this.iframe.style.width = '100%';
        this.iframe.style.height = '100%';
        this.iframe.style.border = 'none';
        
        this.iframe.src = 'https://embed.diagrams.net/?' + new URLSearchParams({
            embed: '1',
            spin: '1',
            modified: 'unsavedChanges',
            proto: 'json',
            saveAndExit: '0',
            noExitBtn: '1',
            ui: currentTheme,
            pageShow: '0'
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
    /**
     * Updates the editor theme based on current settings.
     */
    updateTheme() {
        const currentTheme = this.plugin.getCurrentTheme();
        this.iframe?.contentWindow?.postMessage(JSON.stringify({
            action: 'theme',
            value: currentTheme
        }), '*');
    }

    /**
     * Handles messages received from the Draw.io editor.
     * @param event MessageEvent from the editor iframe
     */
    private async handleMessage(event: MessageEvent) {
        if (event.origin !== 'https://embed.diagrams.net') return;

        try {
            const message = JSON.parse(event.data);

            switch (message.event) {
                case 'init':
                    await this.loadDiagram();
                    break;
                    
                case 'save':
                    const currentTime = Date.now();
                    await this.saveDiagram(message.xml);
                    this.hasUnsavedChanges = false;
                    
                    // Only show save notice if more than 2 seconds have passed since last save
                    if (currentTime - this.lastSaveTime > 2000) {
                        new Notice('Diagram saved');
                        this.lastSaveTime = currentTime;
                    }
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

    /**
     * Loads diagram content into the editor.
     * Reads file content and sends it to the Draw.io iframe.
     */
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

    /**Saves diagram content to the file.
    * @param xml The diagram content in XML format
    */
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

    async setState(state: any, result: ViewStateResult): Promise<void> {
        if (state.file) {
            const file = this.app.vault.getAbstractFileByPath(state.file);
            if (file instanceof TFile) {
                await this.setFile(file);
            }
        }
    }
}

/**
 * Settings tab class for the Draw.io plugin.
 * Provides UI for configuring plugin settings:
 * - Theme selection (system/light/dark)
 * - Default folder path for new diagrams
 */
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