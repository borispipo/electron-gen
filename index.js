const { program } = require('commander');
const path = require("path");
const fs = require("fs");
const {isValidUrl,Session,debounce,json:{isJSON,parseJSON}} = require("@fto-consult/node-utils");
const {app, BrowserWindow, desktopCapturer,Tray,Menu,MenuItem,globalShortcut,systemPreferences,powerMonitor,ipcMain,dialog, nativeTheme} = require('electron')
const isObj = x => x && typeof x =='object';
const currentProcessId = require('process').pid || null;
const exitTimeoutRef = {current:undefined};

const isDarwin = process.platform =='darwin';
const isWindow = process.platform =="win32";
const iconExtension = isWindow ? "ico" :  isDarwin ? "incs" : "png";
const iconName = `icon.${iconExtension}`;
const logoIconName = `logo.${iconExtension}`;
program
  .option('-u, --url <url>', 'L\'adresse url à ouvrir au lancement de l\'application')
  .option('--node-integration <boolean>', 'Si l\'integration node est autorisée')
  //.option('-r, --root <projectRoot>', 'le chemin du project root de l\'application')
  .option('-l, --icon [iconPath]', 'le chemin vers le dossier des icones de l\'application : (Dans ce dossier, doit contenir une image icon.ico pour window, icon.incs pour mac et icon.png pour linux)')
  .parse();

const programOptions = program.opts();
const {url:pUrl,root:mainProjectRoot,icon} = programOptions;
let mainNodeIntegration = !!programOptions.nodeIntegration;
const distPath = path.join("dist",'index.html');
const processCWD = process.cwd();
const appPath = app.getAppPath();
const isAsar = appPath.indexOf('app.asar') !== -1;
const packageJSONPath = fs.existsSync(path.resolve(appPath,"package.json")) ? path.resolve(appPath,"package.json") : fs.existsSync(processCWD,"package.json")? path.resolve(processCWD,"package.json") : path.resolve(appPath,"package.json") ;
const packageJSON = fs.existsSync(packageJSONPath) ? Object.assign({},require(`${packageJSONPath}`)) : {};
const appName = typeof packageJSON.realAppName =="string" && packageJSON.realAppName || typeof packageJSON.name =="string" && packageJSON.name || "";  

let iconPath = icon && typeof icon =="string" && fs.existsSync(path.resolve(icon)) && path.resolve(icon) ||
icon && typeof icon =="string" && fs.existsSync(path.resolve(appPath,icon)) && path.resolve(appPath,icon) || undefined; 
if(!iconPath && packageJSON.icon && typeof packageJSON.icon ==="string" ){
  if(fs.existsSync(path.resolve(packageJSON.icon))){
    iconPath = path.resolve(packageJSON.icon);
  } else if(path.resolve(appPath,packageJSON.icon)){
    iconPath = path.resolve(appPath,packageJSON.icon);
  }
} 
if(!iconPath){
  iconPath = path.resolve(processCWD);
}
if(iconPath && fs.existsSync(path.resolve(iconPath,iconName))){
    iconPath = path.resolve(iconPath,iconName);
} else if(iconPath && fs.existsSync(path.resolve(iconPath,logoIconName))){
  iconPath = path.resolve(iconPath,logoIconName);
}

// fermee automatiquement quand l'objet JavaScript sera garbage collected.
let mainWindow = undefined;

Menu.setApplicationMenu(null);

const indexFilePath = path.resolve(path.join(appPath,distPath));
const mainProcessPath = path.join('processes',"main","index.js");
const mainProcessIndex = fs.existsSync(path.resolve(appPath,mainProcessPath)) && path.resolve(appPath,mainProcessPath);
const mainProcessRequired = mainProcessIndex && require(`${mainProcessIndex}`);
//pour étendre les fonctionnalités au niveau du main proceess, bien vouloir écrire dans le fichier ../electron/main/index.js
const mainProcess = mainProcessRequired && typeof mainProcessRequired =='object'? mainProcessRequired : {};
const execPath = app.getPath ('exe') || process.execPath;
const APP_PATH = path.join(app.getPath("appData"),appName?.toUpperCase());
const session = Session({appName});
const appUrlSessionkey = "main-app-url";
// Gardez une reference globale de l'objet window, si vous ne le faites pas, la fenetre sera
if(!isValidUrl(pUrl) && !fs.existsSync(indexFilePath)){
  throw {message:`Unable to start the application: index file located at [${indexFilePath}] does not exists : appPath = [${appPath}], exec path is ${execPath}`}
}

const quit = ()=>{
    try {
      app.quit();
    } catch(e){
      console.log(e," triing kit app")
    }
}

//app.disableHardwareAcceleration();

function createBrowserWindow (options){
    options = Object.assign({},options);
    const {isMainWindow} = options;
    delete options.isMainWindow;
    const nIntegration = typeof options.nodeIntegration =="boolean"? options.nodeIntegration : isMainWindow ? mainNodeIntegration : false;
    const menu = options.menu;
    options.webPreferences = isObj(options.webPreferences)? options.webPreferences : {};
    options.webPreferences = {
      sandbox: false,
      webSecurity : true,
      plugin:false,
      autoHideMenuBar: true,
      contentSecurityPolicy: `
        default-src 'none';
        script-src 'self';
        img-src 'self' data:;
        style-src 'self';
        font-src 'self';
      `,
      ...options.webPreferences,
      nodeIntegration: nIntegration,
      contextIsolation : typeof options.contextIsolation =='boolean'? options.contextIsolation : isMainWindow ? !nIntegration : false,
      devTools: typeof options.webPreferences.devTools === 'boolean'? options.webPreferences.devTools : false,
      allowRunningInsecureContent: false,
      preload: options.preload ? options.preload : null,
    }
    if(options.modal && !options.parent && mainWindow){
      options.parent = mainWindow;
    }
    if(typeof options.show ==='undefined'){
      options.show = false;
    }
    let showOnLoad = options.showOnLoad ===true ? true : undefined;
    if(showOnLoad){
       options.show = false;
    }
    if(typeof mainProcess?.beforeCreateWindow =='function'){
       const opts = Object.assign({},mainProcess.beforeCreateWindow(options));
       options = {...options,...opts};
    }
    options.icon = options.icon || iconPath;
    if(isMainWindow){
      mainNodeIntegration = options.webPreferences.nodeIntegration;
      options.webPreferences.contextIsolation = options.webPreferences.nodeIntegration ? false : true;
    }
    const url = isValidUrl(options.url) || typeof options.url ==='string' && options.url.trim().startsWith("file://") ? options.url : undefined;
    const file = options.file && typeof options.file ==="string" && fs.existsSync(path.resolve(options.file)) && options.file || null;
    if(false && mainNodeIntegration && url && isMainWindow && (url !== pUrl && !(url.trim().startsWith("file://")))){
      ///url = undefined; //lorsque le nodeIntegration est actif, aucun notre url est autorisé sauf les url locales
    } 
    let window = new BrowserWindow(options);
    window.mainElectronNodeIntegration = options.webPreferences.nodeIntegration;
    if(!menu){
        window.setMenu(null);
        window.removeMenu();
        window.setMenuBarVisibility(false)
        window.setAutoHideMenuBar(true)
    }
    if(showOnLoad){
      window.once('ready-to-show', () => {
          window.show();
          window.webContents.send("window-ready-to-show",JSON.stringify(options.readyToShowOptions));
      });
    }
    window.on('closed', function() {
        if(isMainWindow && typeof mainProcess?.onMainWindowClosed == "function"){
          mainProcess.onMainWindowClosed(window);
        }
        window = null;
    });
    window.webContents.on('context-menu',clipboadContextMenu);
    if(url){
      window.loadURL(url).then((u)=>{
        window.loadedUrl = url;
      }).catch(e=>{
        console.log("loading url from main window ",e,url);
        if(file){
          window.loadFile(path.resolve(file));
        }
      });
    } else if(file){
      window.loadFile(path.resolve(file));
    } 
    return window;
}

app.whenReady().then(() => {
    createWindow();
    const readOpts = {toggleDevTools,browserWindow:mainWindow,mainWindow:mainWindow};
    if(typeof mainProcess.whenAppReady =='function'){
       mainProcess.whenAppReady(readOpts);
    }
    globalShortcut.register('CommandOrControl+F12', () => {
      return toggleDevTools();
    });
    app.on('activate', function () {
      if (mainWindow == null || (BrowserWindow.getAllWindows().length === 0)) createWindow()
    });
    appIsReady = true;
});

const getMainBrowserTitle = ()=>{
  if(!mainWindow || !mainWindow?.getTitle) {
    return "";
  } else {
    return mainWindow.getTitle();
  }
}

const getAppUrl = ()=>{
  const url = session.get(appUrlSessionkey);
  return isValidUrl(url)? url : undefined;
}
const setAppUrl = (url)=>{
  if(isValidUrl(url)){
      session.set(appUrlSessionkey,url);
  }
  return session.get(appUrlSessionkey);
}

function createWindow () { 
    // Créer le browser window
    const aUrl = getAppUrl();
    mainWindow = createBrowserWindow({
      showOnLoad : false,
      url : isValidUrl(pUrl)? pUrl : isValidUrl(aUrl)? aUrl : undefined,
      isMainWindow : true,
      file : indexFilePath,
      registerDevToolsCommand : false,
      preload : path.resolve(__dirname,"src",'preload',"index.js"),
      webPreferences : {
        devTools : true,
      }
    });
   const sOptions = {width: 500, height: 400, transparent: true, frame: false, alwaysOnTop: true};
    const splash = typeof mainProcess.splashScreen ==='function'&& mainProcess.splashScreen(sOptions) 
      || typeof mainProcess.splash ==='function' && mainProcess.splash(sOptions) 
      || (mainProcess.splash instanceof BrowserWindow) && mainProcess.splash
      || (mainProcess.splashScreen instanceof BrowserWindow) && mainProcess.splashScreen;
      null;
    let hasInitWindows = false;
    mainWindow.on('show', () => {
      //mainWindow.blur();
      setTimeout(() => {
        mainWindow.focus();
        mainWindow.moveTop();
        mainWindow.webContents.focus(); 
        if(!hasInitWindows){
          hasInitWindows = true; 
          mainWindow.webContents.send('appReady');
        } 
      }, 200);
    });
  
    mainWindow.on("focus",()=>{
      if(mainWindow && hasInitWindows){
        mainWindow.webContents.send("main-window-focus");
      }
    });
    mainWindow.on("blur",()=>{
      if(mainWindow && hasInitWindows){
        mainWindow.webContents.send("main-window-blur");
      }
    });
    mainWindow.once("ready-to-show",function(){
        if(typeof mainProcess.onMainWindowReadyToShow ==='function'){
            mainProcess.onMainWindowReadyToShow(mainWindow);
        }
        try {
          if(splash && splash instanceof BrowserWindow){
            const splashTimeout = typeof mainProcess.splashTimeout =="number" ? mainProcess.splashTimeout : 2000;
            setTimeout(()=>{
              splash.destroy();
              mainWindow.minimize();
              mainWindow.restore();
              mainWindow.show();
            },splashTimeout);
          } else {
            mainWindow.minimize();
            mainWindow.restore();
            mainWindow.show();
          }
        } catch{ }
    })    
   
    mainWindow.on('close', (e) => {
        if (mainWindow) {
          if(typeof mainProcess.onMainWindowClose == "function" && mainProcess.onMainWindowClose(mainWindow,{exit:askAndExitApp}) === false){
              return;
          }
          e.preventDefault();
          setTimeout(()=>{
            askAndExitApp();    
            exitTimeoutRef.current = null;
          },500);
          exitTimeoutRef.current = true;
          mainWindow?.webContents.send("before-app-exit");
        }
    });
    
    mainWindow.on('unresponsive', async () => {
      const { response } = await dialog.showMessageBox({
        title: "L'application a cessé de répondre",
        message : 'Voulez vous relancer l\'application?',
        buttons: ['Relancer', 'Arrêter'],
        cancelId: 1
      });
      if (response === 0) {
        mainWindow.forcefullyCrashRenderer()
        mainWindow.reload()
      } else {
        mainWindow.forcefullyCrashRenderer()
        app.exit();
      }
    });
    
    // Émit lorsque la fenêtre est fermée.
    mainWindow.on('closed', () => {
      mainWindow = null
    })
    mainWindow.setMenu(null);
  
    /*** les dimenssions de la fenêtre principale */
    let mWindowSessinName = "mainWindowSizes";
    let mWindowPositionSName = mWindowSessinName+"-positions";
    let sizeW = session.get(mWindowSessinName);
    if(!sizeW || typeof sizeW !== 'object'){
      sizeW = {};
    }
    let sPositions = session.get(mWindowPositionSName);
    if(!sPositions || typeof sPositions !=='object'){
      sPositions = {};
    }
    let isNumber = x => typeof x =="number";
    if(isNumber(sizeW.width) && isNumber(sizeW.height)){
        mainWindow.setSize(sizeW.width,sizeW.height);
        if(isNumber(sPositions.x) && isNumber(sPositions.y)){
            mainWindow.setPosition(sPositions.x,sPositions.y);
        }
    }
    const onWinResizeEv =  debounce(function () {
        if(mainWindow){
            let wSize = mainWindow.getSize();
            if(Array.isArray(wSize) && wSize.length == 2){
                let [width,height] = wSize;
                if(width && height){
                    session.set(mWindowSessinName,{width,height});
                }
                let [x,y] = mainWindow.getPosition();
                session.set(mWindowPositionSName,{x,y});
            }
        }
    }, 100);
    mainWindow.off('resize',onWinResizeEv);
    mainWindow.on('resize',onWinResizeEv);
    mainWindow.off('move',onWinResizeEv);
    mainWindow.on('move',onWinResizeEv);
    if(typeof mainProcess.onCreateMainWindow =='function'){
       mainProcess.onCreateMainWindow(mainWindow);
    }
    return mainWindow;
}
  
  const toggleDevTools = (value)=>{
    if(mainWindow !==null && mainWindow.webContents){
      const isOpen= mainWindow.webContents.isDevToolsOpened();
      value = value === undefined ? !isOpen : value;
      if(value && !isOpen){
          mainWindow.webContents.openDevTools();
          return mainWindow.webContents.isDevToolsOpened();
      } else {
          if(isOpen) mainWindow.webContents.closeDevTools();
      }
      return mainWindow.webContents.isDevToolsOpened();
    }
    return false;
  }
  ipcMain.on("toggle-dev-tools",function(event,value) {
    return toggleDevTools(value);
  });
  
  ipcMain.handle("create-browser-windows",function(event,options){
    if(typeof options =='string'){
      try {
        const t = JSON.parse(options);
        options = t;
      } catch{}
    }
    options = Object.assign({},options);
    createBrowserWindow(options);
  });
  
  ipcMain.on("restart-app",x =>{
    app.relaunch();
  });
  ipcMain.on("clear-exit-timeout",x =>{
    exitTimeoutRef.current = null;
  });
  let tray = null;
  ipcMain.on("update-system-tray",(event,opts)=>{
    opts = opts && typeof opts == 'object'? opts : {};
    let {contextMenu,tooltip} = opts;
    if(tray){
    } else {
      tray = new Tray();
    }        
    if(!tooltip || typeof tooltip !=="string"){
        tooltip = ""
    }
    tray.setToolTip(tooltip);
    if(isJSON(contextMenu)){
        contextMenu = JSON.parse(contextMenu);
    } 
    if(Array.isArray(contextMenu) && contextMenu.length) {
      let tpl = []
      contextMenu.map((m,index)=>{
         if(!m || typeof m !=='object') return;
         m.click = (e)=>{
           if(mainWindow && mainWindow.webContents) mainWindow.webContents.send("click-on-system-tray-menu-item",{
              action : m.action && typeof m.action =='string'? m.action : undefined,
              index,
              menuItem : JSON.stringify(m),
           })
         }
         tpl.push(m);
      })
      contextMenu = Menu.buildFromTemplate(tpl);
    } else contextMenu = null;
    tray.setContextMenu(contextMenu) 
  });
  
  ipcMain.on("get-session",(event,key)=>{
    const p = session.get(key);
    event.returnValue = JSON.stringify(p);
    return p;
  });
  ipcMain.on("get-main-browser-title",(event)=>{
    event.returnValue = getMainBrowserTitle();
    return event.returnValue;
  });
  ipcMain.on("set-session",(event,key,value)=>{
    if(isJSON(value)){
      value = parseJSON(value);
    }
    if(typeof key =="string" && key){
        session.set(key,value);
        return true;
    }
    return false;
  });
  ipcMain.on("set-main-app-url",(event,url)=>{
    event.returnValue = setAppUrl(url);
    return event.returnValue;
  });
  
  ipcMain.on("get-main-app-url",(event)=>{
    event.returnValue = getAppUrl();
    return event.returnValue;
  });
  
  ipcMain.on("get-path",(event,pathName)=>{
    const p = app.getPath(pathName);
    event.returnValue = p;
    return p;
  });
  ipcMain.on("get-APP_PATH",(event,pathName)=>{
    event.returnValue = APP_PATH;
    return event.returnValue;
  });
  ipcMain.on("get-process-id",(event,pathName)=>{
    event.returnValue = currentProcessId;
    return event.returnValue;
  });
  ipcMain.on("get-app-path",(event,pathName)=>{
    event.returnValue = appPath;
    return appPath;
  });
  ipcMain.on("get-project-root",(event)=>{
    event.returnValue  = appPath;
    return event.returnValue;
  });
  
  ipcMain.on("get-process-cwd",(event)=>{
    event.returnValue = processCWD;
    return event.returnValue ;
  });
  
  ipcMain.on("get-package.json",(event)=>{
    event.returnValue = JSON.stringify(packageJSON);
    return event.returnValue ;
  });
    
  ipcMain.on("get-app-name",(event)=>{
    event.returnValue = appName;
    return event.returnValue ;
  });
    
  ipcMain.on("get-media-access-status",(event,mediaType)=>{
    const p = systemPreferences.getMediaAccessStatus(mediaType);
    event.returnValue = p;
    return p;
  });
  
  /**** retourne l'accès au partage de l'écran */
  ipcMain.on("get-desktop-capturer-screen-access",(event)=>{
     event.returnValue = isDarwin || systemPreferences.getMediaAccessStatus('screen') === 'granted';
     return event.returnValue;
  })
  
  ipcMain.on("ask-for-media-access",(event,mediaType)=>{
    systemPreferences.askForMediaAccess(mediaType);
  });
    
  ipcMain.on("get-app-icon",(event)=>{
    event.returnValue = mainWindow != mainWindow && mainWindow.getIcon && mainWindow.getIcon();
  });
  ipcMain.on("set-app-icon",(event,iconPath)=>{
     if(iconPath && mainWindow != null){
        mainWindow.setIcon(iconPath);
        event.returnValue = iconPath;
     } else {
        event.returnValue = null;
     }
  });
  ipcMain.on('minimize-main-window', () => {
    if(mainWindow !== null && mainWindow){
       mainWindow.blur();
       mainWindow.minimize();
    }
  })
  ipcMain.on('restore-main-window', () => {
    if(mainWindow && mainWindow !== null){
      mainWindow.restore()
      mainWindow.blur();
      setTimeout(() => {
        mainWindow.focus();
        mainWindow.moveTop();
        mainWindow.webContents.focus();   
      }, 200);
    }
  });
  const exitApp = _ => {
    if(mainWindow){
      mainWindow.destroy();
    }
    mainWindow = null;
    if(typeof gc =="function"){
      gc();
    }
    quit();
  };
  ipcMain.on('close-main-render-process', exitApp);
  
  const powerMonitorCallbackEvent = (action)=>{
    if(!mainWindow || !mainWindow.webContents) return;
    if(action =="suspend" || action =="lock-screen"){
        mainWindow.webContents.send("main-app-suspended",action);
        return;
    }
    mainWindow.webContents.send("main-app-restaured",action);
    mainWindow.webContents.focus();  
    return null;
  }
  if(powerMonitor){
    ["suspend","resume","lock-screen","unlock-screen"].map((action)=>{
        powerMonitor.on(action,(event)=>{
            powerMonitorCallbackEvent(action,event);
        })
    })
  }
  ipcMain.on("set-main-window-title",(event,title,addSuffix)=>{
    if(mainWindow !== null){
        const loadedUrl = isValidUrl(mainWindow?.loadedUrl) && mainWindow.loadedUrl?.trim() ||"";
        title = `${title}${loadedUrl && addSuffix!==false && !title.includes(loadedUrl)?` [${loadedUrl}]`:""}`;
        mainWindow.setTitle(title);
        event.returnValue = title;
        return event.returnValue ;
    } else event.returnValue = title;
    return event.returnValue ;
  });
  
  ipcMain.handle("show-open-dialog",function(event,options){
    if(typeof options =="string"){
      try {
         const t = JSON.parse(options);
         options = t;
      } catch{}
    }
    if(!isObj(options)){
       options = {};
    }
    return dialog.showOpenDialog(mainWindow,options)
  })
  
  ipcMain.handle("show-save-dialog",function(event,options){
    if(!isObj(options)){
       options = {};
    }
    return dialog.showSaveDialog(mainWindow,options)
  });
  
  ipcMain.on("is-dev-tools-open",function(event,value) {
    if(mainWindow !==null && mainWindow.webContents){
      return mainWindow.webContents.isDevToolsOpened();
    }
    return false;
  });
  
  ipcMain.on("window-set-progressbar",(event,interval)=>{
     if(typeof interval !="number" || interval <0) interval = 0;
     interval = Math.floor(interval);
     if(mainWindow){
       mainWindow.setProgressBar(interval);
     }
  });
  
  /**** customisation des thèmes de l'application */
  ipcMain.handle('set-system-theme:toggle', (event,theme) => {
    theme = theme && typeof theme == "string"? theme : "light";
    theme = theme.toLowerCase().trim();
    if(theme !== 'system' && theme !=='dark'){
      theme = "light";
    }
    nativeTheme.themeSource = theme;
    session.set("os-theme",theme);
    return nativeTheme.shouldUseDarkColors
  });
  
  ipcMain.handle('set-system-theme:dark-mode', (event) => {
      nativeTheme.themeSource = 'dark';
      return nativeTheme.shouldUseDarkColors;
  });
  ipcMain.handle('set-system-theme:light-mode', (event) => {
    nativeTheme.themeSource = 'light';
    return nativeTheme.shouldUseDarkColors;
  });
  
  
  ipcMain.handle('dark-mode:toggle', () => {
    if (nativeTheme.shouldUseDarkColors) {
      nativeTheme.themeSource = 'light'
    } else {
      nativeTheme.themeSource = 'dark'
    }
    return nativeTheme.shouldUseDarkColors
  })
  
  ipcMain.handle('dark-mode:system', () => {
    nativeTheme.themeSource = 'system'
  });
  
  const clipboadContextMenu = (_, props) => {
    if (props.isEditable || props.selectionText) {
      const menu = new Menu();
      if(props.selectionText){
        menu.append(new MenuItem({ label: 'Copier', role: 'copy' }));
        if(props.isEditable){
           menu.append(new MenuItem({ label: 'Couper', role: 'cut' }));
        }
      }
      if(props.isEditable){
        menu.append(new MenuItem({ label: 'Coller', role: 'paste' }));
      }
      menu.popup();
    } 
  };
  
// Quitte l'application quand toutes les fenêtres sont fermées.
app.on('window-all-closed', () => {
    // Sur macOS, il est commun pour une application et leur barre de menu
    // de rester active tant que l'utilisateur ne quitte pas explicitement avec Cmd + Q
    if (process.platform !== 'darwin') {
      quit();
    }
});

ipcMain.on("get-loaded-app-url",(event)=>{
  const p = mainWindow !== null && mainWindow && isValidUrl(mainWindow?.loadedUrl) ? mainWindow?.loadedUrl : '';
  event.returnValue = p;
  return p;
});
const getDesktopCapturerSources = async function(){
  return desktopCapturer.getSources({types: ['window', 'screen']}).then(async sources => {
      return sources.map(source => {
          source.thumbnailURL = source.thumbnail.toDataURL();
          return source;
      });
  });
}
ipcMain.handle("get-desktop-capturer-sources",async (event,options)=>{
  if(isJSON(options)){
    options = JSON.parse(options);
  }
  options = Object.assign({},options);
  const sources = await getDesktopCapturerSources(JSON.stringify(options));
  event.returnValue = sources;
  return sources;
});
ipcMain.handle("get-desktop-capturer-source",async (event,options)=>{
  if(isJSON(options)){
    options = JSON.parse(options);
  }
  options = Object.assign({},options);
  const {sourceName} = options;
  if(!Array.isArray(options.types) || !options.types.length){
    options.types = ['window', 'screen'];
  }
  let electronSource = null;
  const browserTitle = getMainBrowserTitle();
  try {
    const sources = await desktopCapturer.getSources(options);
    let result = [];
    for (const source of sources) {
      if (source.name?.includes('Electron')) {
        electronSource = source;
      } else if(sourceName && typeof sourceName =="string" && source.name.toUpperCase().includes(sourceName.toUpperCase()) || source.name.toUpperCase().includes(appName?.toUpperCase()) || source.name?.toUpperCase().includes(browserTitle.toUpperCase())){
          result.push(source);  
      }
    }
    if(electronSource && !result.length){
        result.push(electronSource);
    }
    event.returnValue = result[0];
  } catch(e){
    console.log(e," getting desktop capturer sources");
    event.returnValue = null;
  }
  return event.returnValue;
});

const nodeProcessIDsessionName = "node-process-id";

function isPrevProcessRunning(){
  const processId = session.get(nodeProcessIDsessionName);
  try {
    if(processId){
      return process.kill(processId,0)
    }
  } catch (e) {return e.code === 'EPERM';}
}

if(mainProcess.enableSingleInstance !== false){
    const gotTheLock = app.requestSingleInstanceLock()
    if (!gotTheLock) {  
        quit();
    } else {
      app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance, we should focus our window.
        //pour plus tard il sera possible d'afficher la gestion multi fenêtre en environnement electron
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore()
            mainWindow.focus()
        }
      });
    }
    if(currentProcessId){
        session.set(nodeProcessIDsessionName,currentProcessId);
    }
}
ipcMain.on("has-node-integration",(event)=>{
  event.returnValue = mainWindow ? !!mainWindow?.mainElectronNodeIntegration : mainNodeIntegration;
  return event.returnValue;
});

const askAndExitApp = async (event)=>{
  if(!exitTimeoutRef.current) return;
  exitTimeoutRef.current = null;
  const { response } = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Yes', 'No'],
    title: 'Quittez l\'application',
    message: 'Voulez vous vraiment quitter l\'application?',
    //cancelId: 1
  });
  if(response == 0) {
    exitApp();
    return;
  }
  return;
};