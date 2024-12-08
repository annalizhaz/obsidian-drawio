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

interface DrawioPluginSettings {
    theme: 'system' | 'light' | 'dark';
    defaultFolder: string;
}

const DEFAULT_SETTINGS: DrawioPluginSettings = {
    theme: 'system',
    defaultFolder: 'Diagrams'
};

const VIEW_TYPE_DRAWIO = 'drawio-view';

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

    onunload() {
        this.systemDarkModeQuery.removeListener(this.handleSystemThemeChange.bind(this));
    }

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

    private handleSystemThemeChange() {
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
        this.app.workspace.iterateAllLeaves(leaf => {
            if (leaf.view instanceof DrawioView) {
                leaf.view.updateTheme();
            }
        });
    }

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
            
            const fileName = `${folderPath ? folderPath + '/' : ''}diagram-${Date.now()}.drawio`;
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
            sketch: '1',
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

    updateTheme() {
        const currentTheme = this.plugin.getCurrentTheme();
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

    async setState(state: any, result: ViewStateResult): Promise<void> {
        if (state.file) {
            const file = this.app.vault.getAbstractFileByPath(state.file);
            if (file instanceof TFile) {
                await this.setFile(file);
            }
        }
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