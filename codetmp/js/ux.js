let previewUrl = 'https://cpreview.web.app/';
let debugPWAUrl = '';
let lastOpenTabIndex = 0;

const editorManager = {
  initEmmet: function() {
    loadExternalFiles([
      'ace/ext-emmet.js',
      'ace/emmet-core/emmet.js',
    ]).then(() => {
      require(["ace/ace", "ace/ext/emmet"], function() {
        for (let tab of fileTab) {
          tab.editor.env.editor.setOption('enableEmmet', true);
        }
      });
    })
  },
  initAutocomplete: function() {
    loadExternalFiles([
      'ace/ext-language_tools.js',
    ]).then(() => {
      require(["ace/ace", "ace/ext/language_tools"], function() {
        for (let tab of fileTab) {
          tab.editor.env.editor.setOption('enableBasicAutocompletion', true);
          tab.editor.env.editor.setOption('enableSnippets', true);
          tab.editor.env.editor.setOption('enableLiveAutocompletion', true);
        }
      });
    })
  }
}

const ui = {
  
  fm: {
    renameFolder: function() {
      
      let folder = odin.dataOf(selectedFile[0].getAttribute('data'), fileStorage.data.folders, 'fid');
      
      let name = getPromptInput('Folder name', folder.name);
      if (!name || name === folder.name) return;
      
      let modifiedTime = new Date().toISOString();
      folder.name = name;
      folder.modifiedTime = modifiedTime;
      
      handleSync({
        fid: folder.fid,
        action: 'update',
        metadata: ['name'],
        type: 'folders'
      });
      drive.syncToDrive();
      
      fileStorage.save();
      fileList();
      
      $('#btn-rename-folder').classList.toggle('w3-hide', true);
    },
    newFolder: function() {
      
      let name = getPromptInput('Folder name', 'Untitled');
      if (!name) return;
      
      let modifiedTime = new Date().toISOString();
      let folder = new Folder({
        name,
        modifiedTime,
        parentId: activeFolder,
      });
      fileManager.sync(folder.fid, 'create', 'folders');
      drive.syncToDrive();
      fileManager.list();
      fileStorage.save();
    },
    deleteFolder: function() {
      
      if (!window.confirm('Sub files & folders will also be delete. Delete anyway?')) return;
      
      let data = odin.dataOf(selectedFile[0].getAttribute('data'), fileStorage.data.folders, 'fid');
      data.trashed = true;
      
      handleSync({
        fid: data.fid,
        action: 'update',
        metadata: ['trashed'],
        type: 'folders'
      });
      drive.syncToDrive();
      
      fileStorage.save();
      fileList();
      selectedFile.splice(0, 1);
    },
    deleteFile: function(fid) {
      
      if (!window.confirm('Delete this file?')) return;
      
      if (typeof(fid) === 'undefined')
        fid = selectedFile[0].getAttribute('data');
        
      let data = odin.dataOf(fid, fileStorage.data.files, 'fid');
      data.trashed = true;
      
      if (activeFile && data.fid === activeFile.fid) {
        activeFile = undefined;
        $('.icon-rename')[activeTab].textContent = 'fiber_manual_record';
      }
      
      for (let sync of fileStorage.data.sync) {
        if (sync.action === 52 && sync.copyId === fid)
          sync.action = 12;
      }
      
      handleSync({
        fid: data.fid,
        action: 'update',
        metadata: ['trashed'],
        type: 'files'
      });
      drive.syncToDrive();
      
      fileStorage.save();
      fileList();
      selectedFile.splice(0, 1);
      locked = -1;
    }
  },
  toggleMenu: function() {
    
    let targetId = this.getAttribute('target');
    let target;
    if (targetId)
      target = $('#'+targetId);
    else
      target = this;

    target.classList.toggle('active');
    
    
    target.lastElementChild.classList.toggle('active');
    target.firstElementChild.classList.toggle('active');
    let menuId = target.getAttribute('menu');
    let menu = $('#'+menuId);
    let block = $('#'+menuId+'-block');
    
    if (target.classList.contains('active') && (menuId === 'in-my-files' || menuId === 'in-trash' || menuId === 'in-settings')) {
      
      $('#list-trash').innerHTML = '';
      $('#file-list').innerHTML = '';
      if (menuId === 'in-my-files')
        fileList();
      else if (menuId === 'in-trash')
        trashList();

      toggleInsertSnippet(false);
    }

    if (!menu) {
      setTimeout(function(){
        target.classList.toggle('active',false);
        target.lastElementChild.classList.toggle('active',false);
        target.firstElementChild.classList.toggle('active',false);
      }, 500);
      return;
    }
    
    for (let el of $('.btn-material')) {
      
      if (el !== target) {
        
        if (!el.classList.contains('active')) continue;
        el.classList.toggle('active',false);
        el.lastElementChild.classList.toggle('active',false);
        el.firstElementChild.classList.toggle('active',false);
        let menuId = el.getAttribute('menu');
        if (menuId === null) continue
        let menu = $('#'+menuId);
        let block = $('#'+menuId+'-block');
        menu.classList.toggle('active',false);
        block.classList.toggle('active',false);
      }
    }
     
    menu.classList.toggle('active');
    block.classList.toggle('active');
    
    if (!menu.classList.contains('active')) {
      selectedFile = [];
    }
  },
  
  switchTab: function(direction = 1) {
  
    if ($('#in-my-files').classList.contains('active') || $('#in-settings').classList.contains('active') || fileTab.length == 1) return
    
    let fid;
    
    if (activeTab + direction > 0 && activeTab + direction < fileTab.length)
      fid = fileTab[activeTab + direction].fid
    else
      fid = (activeTab + direction == -1) ? fileTab[fileTab.length - 1].fid : fileTab[0].fid;
    focusTab(fid);
  },
  
  openNewTab: function() {
    newTab();
  },
  
  toggleWordWrap: function() {
    let editor = fileTab[activeTab].editor;
    let isWrap = editor.env.editor.session.getUseWrapMode();
    editor.env.editor.session.setUseWrapMode(isWrap ? false : true);
    settings.data.wrapMode = editor.env.editor.session.getUseWrapMode();
    settings.save();
    $('#check-word-wrap').checked = settings.data.wrapMode ? true : false;
  },

  toggleEmmet: function() {
    let isEnabled = settings.data.editor.enableEmmet;
    $('#check-emmet').checked = isEnabled ? false : true;
    settings.data.editor.enableEmmet = isEnabled ? false : true;
    settings.save();
    if (settings.data.editor.enableEmmet) {
      navigator.serviceWorker.controller.postMessage({
        type: 'enableEmmet', 
      });
    }
  },

  toggleAutocomplete: function() {
    let isEnabled = settings.data.editor.enableAutocomplete;
    $('#check-autocomplete').checked = isEnabled ? false : true;
    settings.data.editor.enableAutocomplete = isEnabled ? false : true;
    settings.save();
    if (settings.data.editor.enableAutocomplete) {
      navigator.serviceWorker.controller.postMessage({
        type: 'enableAutocomplete', 
      });
    }
  },
  
  toggleAutoSync: function() {
    settings.data.autoSync = !settings.data.autoSync;
    settings.save();
    $('#check-auto-sync').checked = settings.data.autoSync ? true : false;
  }
};

function getPromptInput(message, defaultValue='') {
  let input = window.prompt('Rename :', defaultValue);
  if (input === null)
    return false;
  if (input.trim().length === 0)
    return defaultValue;
  return input;
}

function blurNavigation() {
  $('#nav-bar').classList.toggle('hoverable');
  setTimeout(() => {
    $('#nav-bar').classList.toggle('hoverable');
  }, 250);
}

function attachMenuLinkListener() {
  
  for (let menu of $('.menu-link')) {
    let callback;
    switch (menu.dataset.callback) {
      case 'save':
      case 'preview':
        callback = function() {
          $('#btn-menu-' + menu.dataset.callback).click();
          blurNavigation()
        };
      break;
      case 'deploy':
        callback = function() {
          renderAndDeployLocked();
          blurNavigation()
        };
      break;
      case 'download-rendered':
        callback = function() {
          fileDownload();
          blurNavigation()
        };
      break;
      case 'deploy-single':
        callback = function() {
          renderAndDeploySingle();
          blurNavigation()
        };
      break;
      case 'my-files':
        callback = function() {
          $('#btn-menu-my-files').click();
          blurNavigation()
        };
      break;
      case 'file info':
        callback = function() {
          
          setTimeout(function() {
            let isOpened = environment.toggle();
            if (isOpened)
              fileTab[activeTab].editor.env.editor.blur()
            else
              fileTab[activeTab].editor.env.editor.focus()
          }, 1)
          
          blurNavigation()
        };
      break;
      case 'trash':
        callback = function() {
          if (!$('#in-trash').classList.contains('active'))
            $('#btn-menu-trash').click();
          blurNavigation()
        };
      break;
      case 'toggle-wrap-mode':
        callback = ui.toggleWordWrap;
      break;
      case 'toggle-editor-theme':
        callback = function() {
          if (editor.env.editor.getTheme().includes('monokai'))
            editor.env.editor.setTheme('ace/theme/github');
          else
            editor.env.editor.setTheme('ace/theme/monokai');
        }
      break;
      case 'set-font-size':
        callback = function() {
          let size = parseInt(window.prompt('Prefered font size', 14));
          if (size)
            editor.env.editor.setFontSize(size);
        }
      break;
      case 'about':
        callback = function() {
          if (!$('#in-home').classList.contains('active'))
            $('#btn-home').click();
          blurNavigation()
        };
      break;
      case 'settings':
        callback = function() {
          if (!$('#in-settings').classList.contains('active'))
            $('#btn-menu-settings').click();
          blurNavigation();
        };
      break;
      case 'sign-out':
        callback = signOut;
      break;
    }
    menu.addEventListener('click', callback);
  }
}

function logWarningMessage() {
	let cssRule = "color:rgb(249,162,34);font-size:60px;font-weight:bold";
	setTimeout(console.log.bind(console, "%cATTENTION", cssRule), 0); 
	setTimeout(console.log.bind(console, "Someone might be tyring to steal your data by asking you to enter malicious code from here!"), 0); 
	setTimeout(console.log.bind(console, "If this was not intended, you can close this window by clicking 'x' on the top right corner of this window or by closing current browsing tab."), 0); 
	setTimeout(console.log.bind(console, "Ignore this message if you're well aware of what you're going to do."), 0); 
}

function updateUI() {
  
  fileList();
  $('#check-word-wrap').checked = settings.data.wrapMode ? true : false;
  $('#check-emmet').checked = settings.data.editor.enableEmmet ? true : false;
  $('#check-autocomplete').checked = settings.data.editor.enableAutocomplete ? true : false;
  $('#check-auto-sync').checked = settings.data.autoSync ? true : false;

  newTab();
  
  window.name = 'parent';
  window.environment = anibar('main-editor');

  o.listen({
    'btn-create-template'   : createBlogTemplate,
    'btn-create-entry'      : createBlogEntry,
    'btn-create-app'        : createBlogApp,
    'btn-menu-template'     : function() { toggleInsertSnippet() },
    'btn-new-folder'        : ui.fm.newFolder,
    'btn-new-file'          : function() { $('#btn-menu-my-files').click(); ui.openNewTab(); },
    'btn-rename-folder'     : ui.fm.renameFolder,
    'btn-delete-file'       : function() { ui.fm.deleteFile(activeFile.fid) },
    'btn-download-file'     : function() { fileDownload() },
    'btn-menu-save'         : fileManager.save,
    '.btn-material'         : ui.toggleMenu,
    'btn-menu-preview'      : function() { previewHTML() },
    'btn-menu-info'         : btnInfo,
    '.file-settings-button' : function() { showFileSetting(this.dataset.section) },
    'more-tab'              : function() { ui.switchTab(1) },
    'btn-refresh-sync'      : function() { drive.syncFromDrive() },
  });
  initPreviewFrame();
  applyKeyboardListener();
  attachMenuLinkListener();
  if (settings.data.editor.enableEmmet) {
    editorManager.initEmmet();
  }
  if (settings.data.editor.enableAutocomplete) {
    editorManager.initAutocomplete();
  }
}

function initPreviewFrame() {
  $('#limbo-element').append(o.cel('iframe', {id:'PreviewFrame', name:'PreviewFrame'}));
}

function showFileSetting(section) {
  for (let element of $('.file-settings-button')) {
    if (element.dataset.section == section)
      element.classList.toggle('hide', true);
  }
  
  for (let element of $('.file-settings')) {
    if (element.dataset.section == section)
      element.classList.toggle('hide', false);
  }
}

function toggleInsertSnippet(persistent) {
  if ($('#in-my-files').classList.contains('active') || $('#in-settings').classList.contains('active')) return

  let el = $('.search-box')[0];
  if (typeof(persistent) == 'undefined')
    el.classList.toggle('w3-hide');
  else
    el.classList.toggle('w3-hide', !persistent);

  if (!el.classList.contains('w3-hide')) {
    $('#search-input').value = '';
    $('#search-input').focus();
  } else {
    setTimeout(() => { document.activeElement.blur() }, 1);
    if (typeof(persistent) === 'undefined')
      fileTab[activeTab].editor.env.editor.focus();
    $('#search-input').value = '';
    $('#search-input').blur();
  }
}


function compressTab(idx) {
  for (let tab of $('.file-tab'))
    tab.style.display = 'inline-block';

  $('#more-tab').style.display = ($('.file-tab').length > 1 && getTabWidth() >= $('#file-title').offsetWidth - 48) ? 'inline-block' : 'none';
  let maxOpenTab = Math.floor(($('#file-title').offsetWidth - 48) / $('.file-tab')[idx].offsetWidth);

  if ($('.file-tab').length > maxOpenTab) {
    let lastOpenedTabIndex = Math.max(idx, $('.file-tab').length - 1);
    let firstOpenedTabIndex = Math.max(lastOpenedTabIndex - (maxOpenTab - 1), 0);
    
    if (idx >= lastOpenTabIndex && idx <= lastOpenTabIndex + maxOpenTab - 1) {
      firstOpenedTabIndex = lastOpenTabIndex;
      lastOpenedTabIndex = firstOpenedTabIndex + maxOpenTab - 1;
    }
    
    while (idx < firstOpenedTabIndex) {
      lastOpenedTabIndex--;
      firstOpenedTabIndex--;
    }
    
    for (let i=0; i<$('.file-tab').length; i++) {
      if (i < firstOpenedTabIndex || i > lastOpenedTabIndex)
        $('.file-tab')[i].style.display = 'none';
      else
        $('.file-tab')[i].style.display = 'inline-block';
    }
    
    lastOpenTabIndex = firstOpenedTabIndex;
  }
}

function focusTab(fid) {
  
  let idx = odin.idxOf(String(fid), fileTab, 'fid');
  
  for (let tab of $('.file-tab'))
    tab.lastElementChild.style.background = '#202020';
  
  $('.file-tab')[idx].lastElementChild.style.background = '#154358';
  
  compressTab(idx);
  activeTab = idx;
  $('#editor-wrapper').innerHTML = '';
  $('#editor-wrapper').append(fileTab[idx].editor)
  
  fileTab[idx].editor.env.editor.focus();
  fileTab[idx].editor.env.editor.session.setUseWrapMode(settings.data.wrapMode);
  activeFile = (String(fid)[0] == '-') ? undefined : fileTab[activeTab].file;
  setEditorMode(fileTab[activeTab].name);
  
  let fileSettings = {};
  if (activeFile) {
    fileSettings = activeFile.description.startsWith('{') ? JSON.parse(activeFile.description) : parseDescriptionOld(activeFile.description);
  }
  
  openDevelopmentSettings(fileSettings);
  
}

function fixOldSettings(key, desc, settings) {
  if (key == 'blogName' && settings.blog)
    desc.value = settings.blog;
  else if (key == 'entryId' && settings.eid)
    desc.value = settings.eid;
  else if ((key == 'isWrap' && settings.pre) ||
  (key == 'isSummaryFix' && settings.bibibi) ||
  (key == 'isBreak' && settings.more)
  )
    desc.checked = true;
}

function openDevelopmentSettings(settings) {
	for (let desc of $('.description')) {
	  let key = desc.getAttribute('name');
    if (['text','textarea','hidden'].includes(desc.type))
      desc.value = settings[key] || '';
    else if (desc.type == 'checkbox')
      desc.checked = settings[key] || false;
    fixOldSettings(key, desc, settings);
	}
	
	for (let element of $('.file-settings-button'))
    element.classList.toggle('hide', false);
	
	for (let element of $('.file-settings'))
    element.classList.toggle('hide', true);
	
  if (settings.blogName || settings.blog)
    showFileSetting('blogger');
  if (settings['pwa-name'])
    showFileSetting('pwa');
}

function setEditorMode(fileName = '') {
  let editor = fileTab[activeTab].editor.env.editor;
  if (fileName.endsWith('.txt'))
    editor.session.setMode();
  else if (fileName.endsWith('.css'))
    editor.session.setMode("ace/mode/css");
  else if (fileName.endsWith('.js'))
    editor.session.setMode("ace/mode/javascript");
  else if (fileName.endsWith('.json'))
    editor.session.setMode("ace/mode/json");
  else
    editor.session.setMode("ace/mode/html");
}

function initEditor(content = '', scrollTop = 0, row = 0, col = 0) {
  let editorElement = document.createElement('div');
  editorElement.classList.add('editor');
  editorElement.style.opacity = '0'
  let editor = ace.edit(editorElement);
  
  editor.setTheme("ace/theme/monokai", () => {
    editorElement.style.opacity = '1';
  });
  editor.session.setMode("ace/mode/html");
  editor.session.setUseWrapMode(settings.data.wrapMode);
  editor.session.setTabSize(2);
  editor.setFontSize(14);
  editor.clearSelection();
  editor.focus();
  editor.moveCursorTo(0,0);

  editor.commands.addCommand({
    name: "movelinesup",
    bindKey: {win:"Ctrl-Shift-Up"},
    exec: function(editor) {
      editor.moveLinesUp();
    }
  });
  editor.commands.addCommand({
    name: "movelinesdown",
    bindKey: {win:"Ctrl-Shift-Down"},
    exec: function(editor) {
      editor.moveLinesDown();
    }
  });
  editor.commands.addCommand({
    name: "select-or-more-after",
    bindKey: {win:"Ctrl-D"},
    exec: function(editor) {
      if (editor.selection.isEmpty()) {
        editor.selection.selectWord();
      } else {
        editor.execCommand("selectMoreAfter");
      }
    }
  });
  editor.commands.addCommand({
    name: "removeline",
    bindKey: {win: "Ctrl-Shift-K"},
    exec: function(editor) {
      editor.removeLines();
    }
  });
  
  let fontSizeScale = [12, 14, 16, 18, 21, 24, 30, 36, 48];
  let defaultFontSize = 1;
  let fontSize = 1;
  editor.commands.addCommand({
    name: "decrease-font-size",
    bindKey: {win: "Ctrl--"},
    exec: function(editor) {
      event.preventDefault();
      if (fontSize > 0) fontSize--;
      editor.setFontSize(fontSizeScale[fontSize]);
    }
  });
  editor.commands.addCommand({
    name: "increase-font-size",
    bindKey: {win: "Ctrl-="},
    exec: function(editor) {
      event.preventDefault();
      if (fontSize < fontSizeScale.length - 1) fontSize++;
      editor.setFontSize(fontSizeScale[fontSize]);
    }
  });
  editor.commands.addCommand({
    name: "reset-font-size",
    bindKey: {win: "Ctrl-0"},
    exec: function(editor) {
      event.preventDefault();
      fontSize = defaultFontSize;
      editor.setFontSize(fontSizeScale[defaultFontSize]);
    }
  });
  editor.commands.addCommand({
    name: "gotoline",
    bindKey: {win: "Ctrl-G"},
    exec: function(editor, line) {
      if (typeof line === "number" && !isNaN(line))
          editor.gotoLine(line);
      editor.prompt({ $type: "gotoLine" });
    },
  });
  editor.setValue(content)
  editor.clearSelection();
  editor.getSession().setUndoManager(new ace.UndoManager())
  editor.focus();
  editor.getSession().setScrollTop(scrollTop);
  editor.moveCursorTo(row, col);
  editor.commands.removeCommand('fold');
  editor.session.on("change", function(delta) {
    $('.icon-rename')[activeTab].textContent = 'fiber_manual_record';
    $('.icon-rename')[activeTab].classList.toggle('w3-hide', false);
  })
   
  if (settings.data.editor.enableEmmet) {
    editor.setOption('enableEmmet', true);
  }
  if (settings.data.editor.enableAutocomplete) {
    editor.setOptions({
      'enableBasicAutocompletion': true,
      'enableSnippets': true,
      'enableLiveAutocompletion': true,
    });
  }

  return editorElement;
}

function newTab(position, data) {
  
  for (let tab of $('.file-tab'))
    tab.lastElementChild.style.background = '#202020';
  
  let fid, el
  if (data) {
    fid = data.fid
    el = o.cel('div', {
      innerHTML: o.creps('tmp-file-tab', {
        fid,
        name: data.name,
        fiber: 'close'
      })
    })
  } else {
    fid = '-' + (new Date).getTime();
    let fileName = 'Untitled';
    let lastIndex = 0;
    let foundUnsaved = false;
    
    for (let i=0; i<$('.file-tab').length; i++) {
      if (typeof(fileTab[i].fid) == 'string') {
        foundUnsaved = true;
        let tabName = $('.file-name',$('.file-tab')[i])[0].textContent;
        if (tabName.split(' ').length > 1) {
          let index = Number(tabName.split(' ')[1]);
          lastIndex = Math.max(lastIndex, index);
        }
      }
    }
    
    if (foundUnsaved && lastIndex == 0)
      fileName += ' 1';
    else if (foundUnsaved && lastIndex > 0)
      fileName += ' '+(lastIndex+1);
    
    el = o.cel('div', {
      innerHTML: o.creps('tmp-file-tab', {
        fid,
        name: fileName,
        fiber: 'close'
      })
    })
  }
  
  if (position >= 0) {
    $('#file-title').insertBefore(el.firstElementChild, $('.file-tab')[position])
    if ($('#file-title').lastElementChild !== $('#more-tab'))
      $('#file-title').append($('#more-tab'))
  } else
    $('#file-title').insertBefore(el.firstElementChild, $('#more-tab'))
  
  
  if (data) {
    if (position >= 0)
      fileTab.splice(position, 0, data);
    else
      fileTab.push(data)
  } else {
    fileTab.push({
      editor: initEditor(),
      fid,
      fiber: 'close',
    });
  }
  
  focusTab(fid)
}

function getTabWidth() {
  let width = 0;
  for (let tab of $('.file-tab'))
    width += tab.offsetWidth;
  return width;
}

function closeTab(focus = true, comeback) {
  
  if (focus) {
    
    if ($('.file-tab')[activeTab].firstElementChild.firstElementChild.textContent.trim() != 'close') {
      
      if (!window.confirm('Changes you made may not be saved')) return;
    }
  }
  
  $('#file-title').removeChild($('.file-tab')[activeTab]);
  fileTab.splice(activeTab, 1);
  
  if (focus) {
    
    if (fileTab.length == 0) {
      newTab()
      activeFile = undefined;
    } else {
      
      if (comeback === undefined) {
        
        if (activeTab == 0)
          focusTab(fileTab[0].fid);
        else
          focusTab(fileTab[activeTab-1].fid);
      }
    }
  }
  
}

function btnInfo() {
  
  let isOpened = environment.toggle();
  if (isOpened)
    fileTab[activeTab].editor.env.editor.blur()
  else
    fileTab[activeTab].editor.env.editor.focus()
}

function createBlogTemplate() {
  
  let templateName = window.prompt('Template name');
  if (!templateName) return;

  oblog.config({
    blog: $('#in-blog-name').value
  });
  
  aww.pop('creating blog template...');
  
  oblog.pages.list(response => {
    
    let notFound = true;
    if (response.items)
      for (let page of response.items) {
        if (page.title == 'Template :: '+templateName) {
          alert('Template already exists in Blogger. Please delete them manually');
          window.open('https://blogger.com/blogger.g?blogID='+oblog.authModule.auth.data.blogId+'#allpages');
          notFound = false;
          break;
        }
      }
    
    if (notFound) {
      oblog.pages.insert({
        title: 'Template :: '+templateName,
      }, response => {
      
        aww.pop('blog template created successfully...');
        $('#chk-in-pre').checked = true;
        $('#in-eid').value = 'p'+response.id;
        fileManager.save();
        
      }, 'id')
    }
    
  },'items(id,title)');
  
  
}

function createBlogEntry() {
  
  let templateName = window.prompt('Post title');
  if (!templateName) return;

  oblog.config({
    blog: $('#in-blog-name').value
  });
  
  aww.pop('creating blog entry...');
  
  oblog.posts.insert({
    title: templateName,
  }, response => {
    
    aww.pop('blog entry created successfully');
    $('#in-eid').value = response.id;
    fileManager.save();
    
  }, 'id')
  
  
}

function createBlogApp() {
  
  let templateName = window.prompt('Post title');
  if (!templateName) return;

  oblog.config({
    blog: $('#in-blog-name').value
  });
  
  aww.pop('creating blog entry...');
  
  oblog.posts.insert({
    title: templateName,
    labels: ['_bloggerApps'],
  }, response => {
    
    aww.pop('blog entry created successfully');
    $('#in-eid').value = response.id;
    $('#in-blog-id').value = response.blog.id;
    fileManager.save();
    
  }, 'id,blog(id)')
  
}

function getFileColor(fileName) {
  let defaultBg;
  if (fileName.includes('.blogger'))
    defaultBg = '#ffa51e';
  else if (fileName.includes('.css'))
    defaultBg = '#1e44ff';
  else if (fileName.includes('.js'))
    defaultBg = '#ccad1b';
  else if (fileName.includes('.html'))
    defaultBg = '#fb5c10';
  else if (fileName.includes('.tmp'))
    defaultBg = '#4aad4d';
  return defaultBg;
}

function loadBreadCrumbs() {
  $('#breadcrumbs').innerHTML = '';
  let i = 0;
  for (let b of breadcrumbs) {
    let link;
    if (i == breadcrumbs.length-1)
      link = o.cel('div',{innerHTML:o.creps('tmp-breadcrumb-fake', b)});
    else
      link = o.cel('div',{innerHTML:o.creps('tmp-breadcrumb', b)});
    $('#breadcrumbs').appendChild(link.firstElementChild);
    i++;
  }
}

function openBread(id) {
  activeFolder = id;
  let idx = odin.idxOf(id,breadcrumbs,'folderId');
  breadcrumbs = breadcrumbs.slice(0,idx+1);
  fileList();
}

function openFolderConfirm(el) {
  if (selectedFile.length < 1)
    selectedFile.push(el);
  
  if (lastClickEl !== undefined && lastClickEl != el) {
    selectedFile.splice(0, 1);
    selectedFile.push(el);
    
    toggleFileHighlight(false);
    doubleClick = false;
  }
  
  if (!doubleClick) {
    $('#btn-rename-folder').classList.toggle('w3-hide', false);
    
    lastClickEl = el;
    doubleClick = true;
    toggleFileHighlight(true);
    setTimeout(function(){
      doubleClick = false;
    }, 500);
  } else {
    $('#btn-rename-folder').classList.toggle('w3-hide', true);
    
    selectedFile.splice(0, 1);
    
    doubleClick = false;
    let folderId = Number(el.getAttribute('data'))
    openFolder(folderId);
    toggleFileHighlight(false);
  }
}

function openFileConfirm(el) {
  if (selectedFile.length < 1)
    selectedFile.push(el);
  
  $('#btn-rename-folder').classList.toggle('w3-hide', true);
  
  if (lastClickEl !== undefined && lastClickEl != el) {
    selectedFile.splice(0, 1);
    selectedFile.push(el);
    
    toggleFileHighlight(false);
    doubleClick = false;
  }
  
  if (!doubleClick) {
    lastClickEl = el;
    doubleClick = true;
    toggleFileHighlight(true);
    setTimeout(function(){
      doubleClick = false;
    },500)
  } else {
    selectedFile.splice(0, 1);
    doubleClick = false;
    openFile(el.getAttribute('data'));
    toggleFileHighlight(false);
  }
}
      
function btnBlogsphereLogout  () {
  
  $('#btn-blogsphere-login').style.display = 'block';
  $('#btn-blogsphere-logout').style.display = 'none';
  
  logout();
  fileStorage.reset();
  settings.reset();
  aww.pop("You've been logged out from Codetmp.");
  
  fileClose();
  activeFolder = -1;
  while (breadcrumbs.length > 1)
    breadcrumbs.splice(1,1);
    
  loadBreadCrumbs();
}

function navScrollUp() {
  let fileContainerOffsetTop = selectedFile[0].classList.contains('folder-list') ? selectedFile[0].offsetTop : selectedFile[0].parentNode.offsetTop;
  let scrollTop = (fileContainerOffsetTop - 8 - 64 - $('#nav-bar').offsetHeight);
  if (scrollTop < $('#file-list').parentNode.scrollTop) {
    $('#file-list').parentNode.scrollTop = scrollTop;
  }
}

function navScrollDown() {
  let fileContainerOffsetTop = selectedFile[0].classList.contains('folder-list') ? selectedFile[0].offsetTop : selectedFile[0].parentNode.offsetTop;
  let scrollTop = (fileContainerOffsetTop + selectedFile[0].offsetHeight + 8);
  let visibleScreenHeight = $('#file-list').parentNode.scrollTop + 64 + $('#nav-bar').offsetHeight + $('#file-list').parentNode.offsetHeight;
  if (scrollTop > visibleScreenHeight)
    $('#file-list').parentNode.scrollTop += scrollTop - visibleScreenHeight;
}

(function() {
  
  function forEachFolder(callback) {
    for (let i = 0; i < $('.folder-list').length; i++) {
      if ($('.folder-list')[i] == selectedFile[0]) {
        callback(i);
        break;
      }
    }
  }
  
  function forEachFile(callback) {
    for (let i = 0; i < $('.file-list').length; i++) {
      if ($('.file-list-clicker')[i] == selectedFile[0]) {
        callback(i);
        break;
      }
    }
  }
  
  function left() {
    
    if (selectedFile[0].classList.contains('folder-list')) {
      
      forEachFolder(i => {
        if (i - 1 >= 0)
          $('.folder-list')[i-1].click();
      });
      
    } else {
      
      forEachFile(i => {
        if (i - 1 >= 0)
          $('.file-list-clicker')[i-1].click();
        else if ($('.folder-list').length > 0)
          $('.folder-list')[$('.folder-list').length - 1].click();
      });
      
    }
  }
  
  function right() {
    
    if (selectedFile[0].classList.contains('folder-list')) {
      
      forEachFolder(i => {
        if (i + 1 < $('.folder-list').length) {
          $('.folder-list')[i + 1].click();
        } else {
          if ($('.file-list').length > 0)
            $('.file-list-clicker')[0].click();
        }
      });
      
    } else {
      
      forEachFile(i => {
        if (i + 1 < $('.file-list').length)
          $('.file-list-clicker')[i + 1].click();
      });
      
    }
  }
  
  function up(fileCount) {
    
    if (selectedFile[0].classList.contains('folder-list')) {
      
      forEachFolder(i => {
        if (i - fileCount >= 0)
          $('.folder-list')[i - fileCount].click();
        else if (i != 0)
          $('.folder-list')[0].click();
      });
      
    } else {
      
      forEachFile(i => {
        if (i - fileCount >= 0) {
          $('.file-list-clicker')[i - fileCount].click();
        } else if ($('.folder-list').length > 0) {
          let index = Math.ceil($('.folder-list').length / fileCount) * fileCount + (i - fileCount);
          if (index >= $('.folder-list').length)
            index -= fileCount;
          index = Math.max(0, index)
  
          $('.folder-list')[index].click();
        }
      });
      
    }
  }
  
  function down(fileCount) {
    
    
    if (selectedFile[0].classList.contains('folder-list')) {
      
      forEachFolder(i => {
        if (i + fileCount < $('.folder-list').length) {
          $('.folder-list')[i + fileCount].click();
        } else {
          let index = (i + fileCount) - Math.ceil($('.folder-list').length / fileCount) * fileCount;
          if (index <= -1)
            index += fileCount;
          index = Math.min($('.file-list').length - 1, index)
              
          if ($('.file-list').length > 0)
            $('.file-list-clicker')[index].click();
        }
      });
      
    } else {
      
      forEachFile(i => {
        if (i + fileCount < $('.file-list').length)
          $('.file-list-clicker')[i + fileCount].click();
        else if (i != $('.file-list').length - 1)
          $('.file-list-clicker')[$('.file-list').length - 1].click();
      });
      
    }
  }
  
  function selectFirstFile() {
    if ($('.folder-list').length > 0)
      $('.folder-list')[0].click();
    else
      $('.file-list-clicker')[0].click();
  }
  
  function navigationHandler() {
    
    if (!$('#btn-menu-my-files').classList.contains('active')) return;
    event.preventDefault();
    
    let fileContainerWidth = (screen.width < 450) ? 153.2 : 203.2;
    let fileCount = Math.floor( ($('#file-list').offsetWidth - 16 * 2) / fileContainerWidth);
    
    switch (event.keyCode) {
      case 37:
      case 38:
        if (event.keyCode == 37)
          left();
        else
          up(fileCount);
        navScrollUp();
      break;
      case 39:
      case 40:
        if (selectedFile.length == 0) {
          selectFirstFile();
          navScrollUp();
        } else {
          if (event.keyCode == 39)
            right();
          else
            down(fileCount);
            
          navScrollDown();
        }
      break;
    }
  }

  window.navigationHandler = navigationHandler;
  
})();


function renderAndDeploySingle() {
  let tmpLocked = locked;
  locked = -1;
  previewHTML(true);
  deploy();
  locked = tmpLocked;
}

function renderAndDeployLocked() {
  previewHTML(true);
  deploy();
}
 
 
function applyKeyboardListener() {
  
  function previousFolder() {
    if ($('#btn-menu-my-files').classList.contains('active') && $('.breadcrumbs').length > 1) {
      event.preventDefault();
      $('.breadcrumbs')[$('.breadcrumbs').length-2].click()
    }
  }
  
  function lockFile() {
    if ($('#btn-menu-my-files').classList.contains('active')) {
      if (selectedFile.length > 0 && selectedFile[0].classList.contains('file-list-clicker')) {
        for (let i=0; i<$('.file-list').length; i++) {
          if ($('.file-list-clicker')[i] == selectedFile[0]) {
            $('.btn-lock')[i].click()
            break;
          }
        }
      }
    } else {
      let fid = fileTab[activeTab].fid;
      let notFile = false;
      if (typeof(fid) == 'string') {
        locked = -1;
        notFile = true;
      } else
        locked = (locked == fid) ? -1 : fid;
      
      if (locked == fid || notFile) {
        aww.pop('File locked');
        $('.file-tab')[activeTab].lastElementChild.style.background = 'orange';
        clearTimeout(lockFile.wait);
        lockFile.wait = setTimeout(() => {
          $('.file-tab')[activeTab].lastElementChild.style.background = '#154358';
        }, 200)
      } else {
        aww.pop('File unlocked');
        $('.file-tab')[activeTab].lastElementChild.style.background = 'inherit';
        clearTimeout(lockFile.wait);
        lockFile.wait = setTimeout(() => {
          $('.file-tab')[activeTab].lastElementChild.style.background = '#154358';
        }, 200)
      }
    }
  }
  
  function keyEscape() {
    if (selectedFile.length > 0) {
      toggleFileHighlight(false);
      doubleClick = false;
      selectedFile.length = 0;
    } else if ($('#btn-menu-my-files').classList.contains('active')) {
      $('#btn-menu-my-files').click();
      fileTab[activeTab].editor.env.editor.focus();
    }
  }
  
  function doubleClickOnFile() {
    selectedFile[0].click();
    if (selectedFile[0])
      selectedFile[0].click();
  }
  
  function renameFile() {
    if (selectedFile[0].dataset.type === 'folder')
      ui.fm.renameFolder();
    else
      fileRename(Number(selectedFile[0].getAttribute('data')));
  }
  
  function deleteSelected() {
    if (selectedFile.length > 0) {
      if (selectedFile[0].getAttribute('data-type') === 'folder')
        ui.fm.deleteFolder();
      else if (selectedFile[0].getAttribute('data-type') === 'file')
        ui.fm.deleteFile();
    }
  }
  
  function toggleMyFiles() {
    if (!keyboard.Alt) return;
    
    if ($('.anibar-main-editor-menu')[0].classList.contains('anibar--active'))
      toggleFileInfo();
      
    $('#btn-menu-my-files').click()
    if ($('#btn-menu-my-files').classList.contains('active')) {
      fileTab[activeTab].editor.env.editor.blur();
      setTimeout(() => { document.activeElement.blur() }, 1);
    } else {
      fileTab[activeTab].editor.env.editor.focus();
    }
  }
  
  function toggleWrapMode() {
    settings.data.wrapMode = !settings.data.wrapMode;
    settings.save();
    focusTab(fileTab[activeTab].fid);
  }
  
  function toggleTemplate() {
    $('#btn-menu-template').click();
  }
  
  function toggleFileInfo() {
    if ($('#btn-menu-my-files').classList.contains('active')) return;
    
    let isOpened = environment.toggle();
    if (isOpened)
      fileTab[activeTab].editor.env.editor.blur()
    else
      fileTab[activeTab].editor.env.editor.focus()
  }
  
  function openFileDirectory() {
    if (!activeFile || $('#btn-menu-my-files').classList.contains('active')) return
    breadcrumbs.splice(1);
    let stack = [];
    let parentId = activeFile.parentId;
    while (parentId != -1) {
      folder = odin.dataOf(parentId, fileStorage.data.folders, 'fid')
      breadcrumbs.splice(1, 0, {folderId:folder.fid, title: folder.name})
      parentId = folder.parentId
    }
    loadBreadCrumbs();
    $('#btn-menu-my-files').click();
    
    if (breadcrumbs.length > 1)
      breadcrumbs.pop();
    openFolder(activeFile.parentId);
  }
  
  function copyUploadBody() {
    let textarea = document.createElement('textarea');
    textarea.style.height = '0';
    document.body.append(textarea);
    previewHTML(true);
    textarea.value = uploadBody;
    textarea.select();
    document.execCommand('copy');
    aww.pop('Copied to clipboard');
    document.body.removeChild(textarea)
    fileTab[activeTab].editor.env.editor.focus()
  }
  
  keyboard.listen({
    'Backspace': previousFolder,
    'Escape': keyEscape,
    'Delete': deleteSelected,
    'Up': navigationHandler,
    'Left': navigationHandler,
    'Down': navigationHandler,
    'Right': navigationHandler,
    'Enter': function() {
      if ($('#btn-menu-my-files').classList.contains('active') && selectedFile.length > 0) {
        event.preventDefault();
        doubleClickOnFile();
      }
    },
  });
  
  
  keyboard.listen({
    'Alt+Enter': renderAndDeployLocked,
    'Alt+Shift+Enter': renderAndDeploySingle,
    'Alt+<': () => ui.switchTab(-1),
    'Alt+>': () => ui.switchTab(1),
    'Alt+L': lockFile,
    'Alt+B': copyUploadBody,
    'Alt+M': toggleMyFiles,
    'Alt+R': toggleWrapMode,
    'Alt+I': toggleFileInfo,
    'Alt+N': ui.openNewTab,
    'Alt+W': closeTab,
    'Alt+O': openFileDirectory,
    'Ctrl+S': fileManager.save,
    'Alt+D': toggleTemplate,
    'Ctrl+Enter': function() {
      if ($('#btn-menu-my-files').classList.contains('active') && selectedFile.length > 0) {
        renameFile();
      } else {
        previewHTML();
      }
    },
  }, true);
};

function autoSync(event) {
  let isOnline = navigator.onLine ? true : false;
  if (isOnline) {
    if (fileStorage.data.rootId !== '') {
      drive.syncFromDrive();
      drive.syncToDrive();
    }
  }
    
}
window.addEventListener('online', autoSync);

window.addEventListener('keydown', function(e) {
  if (e.altKey && fileTab[activeTab].editor.env.editor.isFocused()) {
    e.preventDefault();
  }
  if (!e.ctrlKey && $('#btn-menu-my-files').classList.contains('active')) {
    let found = false;
    for (let el of $('.folder-list')) {
    if (el.title.toLowerCase().startsWith(e.key)) {
      found = true;
      if (selectedFile[0] !== el) {
        el.click();
        navScrollUp();
        navScrollDown();
      }
      break;
    }
    }

    if (found)
      return;

    for (let el of $('.file-list-clicker')) {
    if (el.title.toLowerCase().startsWith(e.key)) {
      found = true;
      if (selectedFile[0] !== el) {
        el.click()
        navScrollUp();
        navScrollDown();
      }
      break;
    }
    }
  }
});
window.addEventListener('copy', function(e) { copyFile(false) });
window.addEventListener('cut', function(e) { copyFile(true) });
window.addEventListener('paste', function(e) { pasteFile() });

window.onbeforeunload = function(e) {
  let notSaved = false;
  for (let icon of $('.icon-rename')) {
    if (icon.textContent !== 'close') {
      notSaved = true;
      break;
    }
  }
  
  if (fileTab.length > 1) {
    notSaved = true
  } else {
    if (fileTab[0].fid[0] !== '-')
      notSaved = true
  }
  
  if (notSaved)
    return  'Changes you made may not be saved';
}

function authReady() {
  if (fileStorage.data.rootId === '')
    drive.readAppData();
  else {
    drive.syncFromDrive();
    drive.syncToDrive();
  }
  
  o.classList.toggle($('.auth-required'), ['unauthorized'], false);
  $('#txt-login-status').textContent = 'Account';
  $('#login-info').style.visibility = 'hidden';
}

function authLogout() {
  $('#login-info').style.visibility = 'visible';  
  $('#txt-login-status').textContent = 'Login';
  o.classList.toggle($('.auth-required'), ['unauthorized'], true);
  fileStorage.reset();
  settings.reset();
}

function signOut() {
  let auth2 = gapi.auth2.getAuthInstance();
  authLogout();
  auth2.signOut().then(function() {
    console.log('User signed out.');
  });
}

function renderButton() {
  gapi.signin2.render('g-signin2', {
    'scope': 'https://www.googleapis.com/auth/blogger https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive',
    'width': 240,
    'height': 50,
    'longtitle': true,
    'theme': 'dark',
    'onsuccess': (googleUser) => {
      auth2.onSignIn(googleUser);
      authReady();
    },
    // 'onfailure': onFailure
  });
}

function lockRender(self, fid, name) {
  for (let el of $('.btn-lock'))
    el.classList.toggle('w3-text-purple', false)
  
  if (locked !== fid) {
    locked = fid;
    self.classList.toggle('w3-text-purple')
  } else {
    locked = -1;
  }
}

function toggleFileHighlight(isActive) {
  if (lastClickEl.dataset.type == 'file')
    o.classList.toggle(lastClickEl, 'bg3', isActive);
  else
    o.classList.toggle(lastClickEl, ['bg3','bg2'], isActive);
}