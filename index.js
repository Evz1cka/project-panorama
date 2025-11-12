/*
 * Copyright 2016 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

(function() {
  var Marzipano = window.Marzipano;
  var bowser = window.bowser;
  var screenfull = window.screenfull;
  var data = window.APP_DATA;

  // Grab elements from DOM.
  var panoElement = document.querySelector('#pano');
  var sceneNameElement = document.querySelector('#titleBar .sceneName');
  var sceneListElement = document.querySelector('#sceneList');
  var sceneElements = document.querySelectorAll('#sceneList .scene');
  var sceneListToggleElement = document.querySelector('#sceneListToggle');
  var autorotateToggleElement = document.querySelector('#autorotateToggle');
  var fullscreenToggleElement = document.querySelector('#fullscreenToggle');
  var mainMenuElement = document.querySelector('#mainMenu');
  var mainMenuCardElement = document.querySelector('#mainMenuCard');
  var loginFormElement = document.querySelector('#loginForm');
  var loginInputElement = document.querySelector('#loginInput');
  var passwordInputElement = document.querySelector('#passwordInput');
  var loginErrorElement = document.querySelector('#loginError');
  var profileSectionElement = document.querySelector('#profileSection');
  var profileListElement = document.querySelector('#profileList');
  var profileResetElement = document.querySelector('#profileReset');

  var PROFILE_STORAGE_KEY = 'virtualTourProfiles';
  var MAX_PROFILES = 5;
  var storageAvailable = isLocalStorageAvailable();
  var savedProfiles = loadSavedProfiles();
  renderProfileList(savedProfiles);

  if (mainMenuElement) {
    mainMenuElement.setAttribute('aria-hidden', 'false');
  }

  if (loginInputElement) {
    loginInputElement.focus();
  }

  if (profileResetElement) {
    profileResetElement.addEventListener('click', function() {
      if (loginFormElement) {
        loginFormElement.reset();
      }
      if (loginErrorElement) {
        loginErrorElement.textContent = '';
      }
      if (loginInputElement) {
        loginInputElement.focus();
      }
    });
  }

  if (mainMenuCardElement) {
    mainMenuCardElement.addEventListener('animationend', function() {
      mainMenuCardElement.classList.remove('shake');
    });
  }

  // Detect desktop or mobile mode.
  if (window.matchMedia) {
    var setMode = function() {
      if (mql.matches) {
        document.body.classList.remove('desktop');
        document.body.classList.add('mobile');
      } else {
        document.body.classList.remove('mobile');
        document.body.classList.add('desktop');
      }
    };
    var mql = matchMedia("(max-width: 500px), (max-height: 500px)");
    setMode();
    mql.addListener(setMode);
  } else {
    document.body.classList.add('desktop');
  }

  // Detect whether we are on a touch device.
  document.body.classList.add('no-touch');
  window.addEventListener('touchstart', function() {
    document.body.classList.remove('no-touch');
    document.body.classList.add('touch');
  });

  // Use tooltip fallback mode on IE < 11.
  if (bowser.msie && parseFloat(bowser.version) < 11) {
    document.body.classList.add('tooltip-fallback');
  }

  if (data.settings.viewControlButtons) {
    document.body.classList.add('view-control-buttons');
  }

  // Viewer options.
  var viewerOpts = {
    controls: {
      mouseViewMode: data.settings.mouseViewMode
    }
  };

  // Initialize viewer.
  var viewer = new Marzipano.Viewer(panoElement, viewerOpts);

  var isAuthorized = false;
  var currentScene = null;

  // Create scenes.
  var scenes = data.scenes.map(function(data) {
    var urlPrefix = "tiles";
    var source = Marzipano.ImageUrlSource.fromString(
      urlPrefix + "/" + data.id + "/{z}/{f}/{y}/{x}.jpg",
      { cubeMapPreviewUrl: urlPrefix + "/" + data.id + "/preview.jpg" });
    var geometry = new Marzipano.CubeGeometry(data.levels);

    // Понижаем минимальный угол обзора, чтобы разрешить ощутимый зум.
    var limiter = Marzipano.RectilinearView.limit.traditional(
      data.faceSize,
      35 * Math.PI / 180,
      120 * Math.PI / 180
    );
    var view = new Marzipano.RectilinearView(data.initialViewParameters, limiter);

    var scene = viewer.createScene({
      source: source,
      geometry: geometry,
      view: view,
      pinFirstLevel: true
    });

    // Create link hotspots.
    data.linkHotspots.forEach(function(hotspot) {
      var element = createLinkHotspotElement(hotspot);
      scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch });
    });

    // Create info hotspots.
    data.infoHotspots.forEach(function(hotspot) {
      var element = createInfoHotspotElement(hotspot);
      scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch });
    });

    return {
      data: data,
      scene: scene,
      view: view
    };
  });

  // Set up autorotate, if enabled.
  var autorotate = Marzipano.autorotate({
    yawSpeed: 0.03,
    targetPitch: 0,
    targetFov: Math.PI/2
  });
  if (data.settings.autorotateEnabled) {
    autorotateToggleElement.classList.add('enabled');
  }

  // Set handler for autorotate toggle.
  autorotateToggleElement.addEventListener('click', function() {
    if (!isAuthorized) {
      return;
    }
    toggleAutorotate();
  });

  // Set up fullscreen mode, if supported.
  if (screenfull.enabled && data.settings.fullscreenButton) {
    document.body.classList.add('fullscreen-enabled');
    fullscreenToggleElement.addEventListener('click', function() {
      screenfull.toggle();
    });
    screenfull.on('change', function() {
      if (screenfull.isFullscreen) {
        fullscreenToggleElement.classList.add('enabled');
      } else {
        fullscreenToggleElement.classList.remove('enabled');
      }
    });
  } else {
    document.body.classList.add('fullscreen-disabled');
  }

  // Set handler for scene list toggle.
  sceneListToggleElement.addEventListener('click', function() {
    if (!isAuthorized) {
      return;
    }
    toggleSceneList();
  });

  // Start with the scene list open on desktop.
  if (!document.body.classList.contains('mobile')) {
    showSceneList();
  }

  // Set handler for scene switch.
  scenes.forEach(function(scene) {
    var el = document.querySelector('#sceneList .scene[data-id="' + scene.data.id + '"]');
    el.addEventListener('click', function() {
      if (!isAuthorized) {
        return;
      }
      switchScene(scene, { forceInitialView: true, keepCurrentView: false });
      // On mobile, hide scene list after selecting a scene.
      if (document.body.classList.contains('mobile')) {
        hideSceneList();
      }
    });
  });

  // DOM elements for view controls.
  var viewUpElement = document.querySelector('#viewUp');
  var viewDownElement = document.querySelector('#viewDown');
  var viewLeftElement = document.querySelector('#viewLeft');
  var viewRightElement = document.querySelector('#viewRight');
  var viewInElement = document.querySelector('#viewIn');
  var viewOutElement = document.querySelector('#viewOut');

  // Dynamic parameters for controls.
  var velocity = 0.7;
  var friction = 3;

  // Associate view controls with elements.
  var controls = viewer.controls();
  controls.registerMethod('upElement',    new Marzipano.ElementPressControlMethod(viewUpElement,     'y', -velocity, friction), true);
  controls.registerMethod('downElement',  new Marzipano.ElementPressControlMethod(viewDownElement,   'y',  velocity, friction), true);
  controls.registerMethod('leftElement',  new Marzipano.ElementPressControlMethod(viewLeftElement,   'x', -velocity, friction), true);
  controls.registerMethod('rightElement', new Marzipano.ElementPressControlMethod(viewRightElement,  'x',  velocity, friction), true);
  controls.registerMethod('inElement',    new Marzipano.ElementPressControlMethod(viewInElement,  'zoom', -velocity, friction), true);
  controls.registerMethod('outElement',   new Marzipano.ElementPressControlMethod(viewOutElement, 'zoom',  velocity, friction), true);

  function sanitize(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function switchScene(scene, options) {
    options = options || {};
    stopAutorotate();
    var forceInitialView = !!options.forceInitialView;
    var keepCurrentView = forceInitialView ? false :
      (typeof options.keepCurrentView !== 'undefined' ? options.keepCurrentView : currentScene !== null);

    if (keepCurrentView) {
      var currentViewParameters = getCurrentViewParameters();
      if (currentViewParameters) {
        scene.view.setParameters(currentViewParameters);
      } else {
        scene.view.setParameters(cloneInitialViewParameters(scene));
      }
    } else {
      scene.view.setParameters(cloneInitialViewParameters(scene));
    }
    scene.scene.switchTo();
    currentScene = scene;
    startAutorotate();
    updateSceneName(scene);
    updateSceneList(scene);
  }

  function cloneInitialViewParameters(scene) {
    var initial = scene.data.initialViewParameters || {};
    return {
      yaw: typeof initial.yaw === 'number' ? initial.yaw : 0,
      pitch: typeof initial.pitch === 'number' ? initial.pitch : 0,
      fov: typeof initial.fov === 'number' ? initial.fov : Math.PI / 2
    };
  }

  function getCurrentViewParameters() {
    if (!currentScene) {
      return null;
    }
    return {
      yaw: currentScene.view.yaw(),
      pitch: currentScene.view.pitch(),
      fov: currentScene.view.fov()
    };
  }

  function updateSceneName(scene) {
    sceneNameElement.innerHTML = sanitize(scene.data.name);
  }

  function updateSceneList(scene) {
    for (var i = 0; i < sceneElements.length; i++) {
      var el = sceneElements[i];
      if (el.getAttribute('data-id') === scene.data.id) {
        el.classList.add('current');
      } else {
        el.classList.remove('current');
      }
    }
  }

  function showSceneList() {
    sceneListElement.classList.add('enabled');
    sceneListToggleElement.classList.add('enabled');
  }

  function hideSceneList() {
    sceneListElement.classList.remove('enabled');
    sceneListToggleElement.classList.remove('enabled');
  }

  function toggleSceneList() {
    sceneListElement.classList.toggle('enabled');
    sceneListToggleElement.classList.toggle('enabled');
  }

  function startAutorotate() {
    if (!isAuthorized) {
      viewer.setIdleMovement(Infinity);
      return;
    }
    if (!autorotateToggleElement.classList.contains('enabled')) {
      return;
    }
    viewer.startMovement(autorotate);
    viewer.setIdleMovement(3000, autorotate);
  }

  function stopAutorotate() {
    viewer.stopMovement();
    viewer.setIdleMovement(Infinity);
  }

  function toggleAutorotate() {
    if (autorotateToggleElement.classList.contains('enabled')) {
      autorotateToggleElement.classList.remove('enabled');
      stopAutorotate();
    } else {
      autorotateToggleElement.classList.add('enabled');
      startAutorotate();
    }
  }

  function createLinkHotspotElement(hotspot) {

    // Create wrapper element to hold icon and tooltip.
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot');
    wrapper.classList.add('link-hotspot');

    // Create image element.
    var icon = document.createElement('img');
    icon.src = 'img/link.png';
    icon.classList.add('link-hotspot-icon');

    // Set rotation transform.
    var transformProperties = [ '-ms-transform', '-webkit-transform', 'transform' ];
    for (var i = 0; i < transformProperties.length; i++) {
      var property = transformProperties[i];
      icon.style[property] = 'rotate(' + hotspot.rotation + 'rad)';
    }

    // Add click event handler.
    wrapper.addEventListener('click', function() {
      if (!isAuthorized) {
        return;
      }
      var targetScene = findSceneById(hotspot.target);
      if (targetScene) {
        switchScene(targetScene, { keepCurrentView: true });
      }
    });

    // Prevent touch and scroll events from reaching the parent element.
    // This prevents the view control logic from interfering with the hotspot.
    stopTouchAndScrollEventPropagation(wrapper);

    // Create tooltip element.
    var tooltip = document.createElement('div');
    tooltip.classList.add('hotspot-tooltip');
    tooltip.classList.add('link-hotspot-tooltip');
    tooltip.innerHTML = findSceneDataById(hotspot.target).name;

    wrapper.appendChild(icon);
    wrapper.appendChild(tooltip);

    return wrapper;
  }

  function createInfoHotspotElement(hotspot) {

    // Create wrapper element to hold icon and tooltip.
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot');
    wrapper.classList.add('info-hotspot');

    // Create hotspot/tooltip header.
    var header = document.createElement('div');
    header.classList.add('info-hotspot-header');

    // Create image element.
    var iconWrapper = document.createElement('div');
    iconWrapper.classList.add('info-hotspot-icon-wrapper');
    var icon = document.createElement('img');
    icon.src = 'img/info.png';
    icon.classList.add('info-hotspot-icon');
    iconWrapper.appendChild(icon);

    // Create title element.
    var titleWrapper = document.createElement('div');
    titleWrapper.classList.add('info-hotspot-title-wrapper');
    var title = document.createElement('div');
    title.classList.add('info-hotspot-title');
    title.innerHTML = hotspot.title;
    titleWrapper.appendChild(title);

    // Create close element.
    var closeWrapper = document.createElement('div');
    closeWrapper.classList.add('info-hotspot-close-wrapper');
    var closeIcon = document.createElement('img');
    closeIcon.src = 'img/close.png';
    closeIcon.classList.add('info-hotspot-close-icon');
    closeWrapper.appendChild(closeIcon);

    // Construct header element.
    header.appendChild(iconWrapper);
    header.appendChild(titleWrapper);
    header.appendChild(closeWrapper);

    // Create text element.
    var text = document.createElement('div');
    text.classList.add('info-hotspot-text');
    text.innerHTML = hotspot.text;

    // Place header and text into wrapper element.
    wrapper.appendChild(header);
    wrapper.appendChild(text);

    // Create a modal for the hotspot content to appear on mobile mode.
    var modal = document.createElement('div');
    modal.innerHTML = wrapper.innerHTML;
    modal.classList.add('info-hotspot-modal');
    document.body.appendChild(modal);

    var toggle = function() {
      wrapper.classList.toggle('visible');
      modal.classList.toggle('visible');
    };

    // Show content when hotspot is clicked.
    wrapper.querySelector('.info-hotspot-header').addEventListener('click', toggle);

    // Hide content when close icon is clicked.
    modal.querySelector('.info-hotspot-close-wrapper').addEventListener('click', toggle);

    // Prevent touch and scroll events from reaching the parent element.
    // This prevents the view control logic from interfering with the hotspot.
    stopTouchAndScrollEventPropagation(wrapper);

    return wrapper;
  }

  // Prevent touch and scroll events from reaching the parent element.
  function stopTouchAndScrollEventPropagation(element, eventList) {
    var eventList = [ 'touchstart', 'touchmove', 'touchend', 'touchcancel',
                      'wheel', 'mousewheel' ];
    for (var i = 0; i < eventList.length; i++) {
      element.addEventListener(eventList[i], function(event) {
        event.stopPropagation();
      });
    }
  }

  function findSceneById(id) {
    for (var i = 0; i < scenes.length; i++) {
      if (scenes[i].data.id === id) {
        return scenes[i];
      }
    }
    return null;
  }

  function findSceneDataById(id) {
    for (var i = 0; i < data.scenes.length; i++) {
      if (data.scenes[i].id === id) {
        return data.scenes[i];
      }
    }
    return null;
  }

  function attemptAuthorization(login, password, options) {
    options = options || {};
    var fromStoredProfile = !!options.fromStoredProfile;
    if (fromStoredProfile && loginInputElement) {
      loginInputElement.value = login;
    }

    if (isValidCredentials(login, password)) {
      handleSuccessfulLogin(login, password, { fromStoredProfile: fromStoredProfile });
      return true;
    }

    handleFailedLogin(fromStoredProfile ?
      'Не удалось войти через сохранённый профиль. Введите пароль вручную.' :
      'Неверный логин или пароль. Попробуйте ещё раз.', {
      login: login
    });

    if (fromStoredProfile) {
      removeProfile(login);
    }

    return false;
  }

  function handleSuccessfulLogin(login, password, options) {
    options = options || {};
    isAuthorized = true;
    document.body.classList.add('authorized');
    if (mainMenuElement) {
      mainMenuElement.classList.add('hidden');
      mainMenuElement.setAttribute('aria-hidden', 'true');
    }
    if (loginErrorElement) {
      loginErrorElement.textContent = '';
    }
    if (!options.fromStoredProfile && loginFormElement) {
      loginFormElement.reset();
    }
    if (passwordInputElement) {
      passwordInputElement.value = '';
    }

    storeProfile(login, password);
    startAutorotate();
  }

  function handleFailedLogin(message, options) {
    options = options || {};
    if (loginErrorElement) {
      loginErrorElement.textContent = message;
    }
    if (loginInputElement && options.login) {
      loginInputElement.value = options.login;
    }
    if (passwordInputElement) {
      passwordInputElement.value = '';
      passwordInputElement.focus();
    }
    if (mainMenuCardElement) {
      mainMenuCardElement.classList.remove('shake');
      void mainMenuCardElement.offsetWidth;
      mainMenuCardElement.classList.add('shake');
    }
  }

  function isValidCredentials(login, password) {
    return login === 'admin' && password === 'student';
  }

  function storeProfile(login, password) {
    if (typeof login !== 'string' || !login || typeof password !== 'string') {
      return;
    }
    savedProfiles = savedProfiles.filter(function(profile) {
      return profile && profile.login !== login;
    });
    savedProfiles.unshift({
      login: login,
      password: password,
      lastUsed: Date.now()
    });
    if (savedProfiles.length > MAX_PROFILES) {
      savedProfiles = savedProfiles.slice(0, MAX_PROFILES);
    }
    persistProfiles();
    renderProfileList(savedProfiles);
  }

  function removeProfile(login) {
    savedProfiles = savedProfiles.filter(function(profile) {
      return profile && profile.login !== login;
    });
    persistProfiles();
    renderProfileList(savedProfiles);
    if (loginErrorElement) {
      loginErrorElement.textContent = '';
    }
    if (passwordInputElement) {
      passwordInputElement.value = '';
    }
    if (loginInputElement) {
      loginInputElement.focus();
    }
  }

  function loadSavedProfiles() {
    if (!storageAvailable) {
      return [];
    }
    try {
      var raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
      if (!raw) {
        return [];
      }
      var profiles = JSON.parse(raw);
      if (!Array.isArray(profiles)) {
        return [];
      }
      return profiles.filter(function(profile) {
        return profile && typeof profile.login === 'string' && typeof profile.password === 'string';
      }).sort(function(a, b) {
        return (b.lastUsed || 0) - (a.lastUsed || 0);
      }).slice(0, MAX_PROFILES);
    } catch (err) {
      return [];
    }
  }

  function persistProfiles() {
    if (!storageAvailable) {
      return;
    }
    try {
      window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(savedProfiles));
    } catch (err) {
      // Swallow storage errors silently to avoid breaking login flow.
    }
  }

  function renderProfileList(profiles) {
    if (!profileSectionElement || !profileListElement) {
      return;
    }
    profileListElement.innerHTML = '';
    if (!profiles.length) {
      profileSectionElement.setAttribute('hidden', '');
      return;
    }
    profileSectionElement.removeAttribute('hidden');
    profiles.forEach(function(profile) {
      var item = document.createElement('div');
      item.classList.add('profile-item');
      item.setAttribute('role', 'listitem');

      var button = document.createElement('button');
      button.type = 'button';
      button.classList.add('profile-button');
      button.textContent = profile.login;
      button.addEventListener('click', function() {
        attemptAuthorization(profile.login, profile.password, { fromStoredProfile: true });
      });

      var removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.classList.add('profile-remove');
      removeButton.setAttribute('aria-label', 'Удалить профиль ' + profile.login);
      removeButton.textContent = '×';
      removeButton.addEventListener('click', function(event) {
        event.stopPropagation();
        removeProfile(profile.login);
      });

      item.appendChild(button);
      item.appendChild(removeButton);
      profileListElement.appendChild(item);
    });
  }

  function isLocalStorageAvailable() {
    try {
      var testKey = '__tour_profiles_test__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return true;
    } catch (err) {
      return false;
    }
  }

  if (loginFormElement) {
    loginFormElement.addEventListener('submit', function(event) {
      event.preventDefault();
      var login = loginInputElement.value.trim();
      var password = passwordInputElement.value;
      attemptAuthorization(login, password, { fromStoredProfile: false });
    });
  }

  // Display the initial scene.
  switchScene(scenes[0], { forceInitialView: true, keepCurrentView: false });

})();
