/*
This file is part of the Juju GUI, which lets users view and manage Juju
environments within a graphical interface (https://launchpad.net/juju-gui).
Copyright (C) 2012-2013 Canonical Ltd.

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU Affero General Public License version 3, as published by
the Free Software Foundation.

This program is distributed in the hope that it will be useful, but WITHOUT
ANY WARRANTY; without even the implied warranties of MERCHANTABILITY,
SATISFACTORY QUALITY, or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Affero
General Public License for more details.

You should have received a copy of the GNU Affero General Public License along
with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

'use strict';


YUI.add('viewlet-service-config', function(Y) {
  var ns = Y.namespace('juju.viewlets'),
      views = Y.namespace('juju.views'),
      templates = Y.namespace('juju.views').Templates,
      plugins = Y.namespace('juju.plugins'),
      models = Y.namespace('juju.models'),
      utils = Y.namespace('juju.views.utils');

  var name = 'config';
  var mixins = [ns.ViewletBaseView, ns.ConflictMixin];

  ns.Config = Y.Base.create(name, Y.View, mixins, {
    template: templates['service-configuration'],
    events: {
      '.settings-config button.confirm': { click: 'saveConfig'},
      '.settings-config button.cancel': { click: 'cancelConfig'},
      '.config-file .fakebutton': { click: 'handleFileClick'},
      '.config-file input[type=file]': { change: 'handleFileChange'}
    },
    bindings: {
      config: {
        'update': function(node, val) {
          if (node.getAttribute('type') === 'checkbox') {
            // In the db boolean options can be stored as strings.
            // Convert them to booleans.
            var booleanValue = (val + '' === 'true');
            if (booleanValue !== node.get('checked')) {
              node.set('checked', booleanValue);
              // We cannot simulate a change event here to trigger the textual
              // value to update or else we'll cause databinding to think
              // there's a conflict the next time this is changed via anyone
              // else.
              // We manually set the html content in order to avoid this.
              node.ancestor('.toggle').one('.textvalue').set('text',
                                                             val);
            }
          } else {
            // On update make sure undefined isn't sent to the user as viewable
            // input.
            if (val === undefined) {
              val = '';
            }
            node.set('value', val);

            if (node.resizingTextarea) {
              // We're hacking into the private method because the extension
              // wasn't designed with the idea that there could be a
              // non-user interface driven change. If the databinding value
              // changes we need to update/resize things and we can't simulate
              // a valueChange event.
              node.resizingTextarea._run_change(val);
            }
          }
        }
      }
    },
    /**
      Viewlet standard render call.

      @method render
      @param {Service} service the model of the service in the inspector.
      @param {Object} viewContainerAttrs an object of helper data from the
        viewlet manager.
    */
    render: function(viewContainerAttrs) {
      var service = viewContainerAttrs.model;
      var settings = [];
      var db = viewContainerAttrs.db;
      var charm = db.charms.getById(service.get('charm'));
      var templatedSettings = utils.extractServiceSettings(
          charm.get('options'), service.get('config'));

      var container = this.get('container');

      container.setHTML(
          this.template({
            service: service,
            settings: templatedSettings,
            exposed: service.get('exposed')}));
      container.all('textarea.config-field').plug(
          plugins.ResizingTextarea, {
            max_height: 200,
            min_height: 18,
            single_line: 18
          }
      );
      this.attachExpandingTextarea();
    },
    /**
      Ensures that all resizing textareas are attached.

      @method attachExpandingTextarea
    */
    attachExpandingTextarea: function() {
      this.get('container').all('textarea.config-field').each(function(n) {
        if (n.resizingTextarea) {
          n.resizingTextarea.resize();
        }
      });
    },
    /**
      Force resize the config textareas.
      ResizingTextarea needs the nodes to be visible to resize properly. We
      hook into the show() so that we can force the resize once the node is
      made visible via its viewlet container. Note that there are dupe hidden
      textarea nodes so we need to check if the node found has the plugin on
      it before running resize.

      @method show
    */
    show: function() {
      this.get('container').show();
      this.attachExpandingTextarea();
    },

    /**
      Pulls the content from each configuration field and sends the values
      to the environment

      @method saveConfig
    */
    saveConfig: function() {
      var inspector = this.viewletManager,
          env = inspector.get('env'),
          db = inspector.get('db'),
          service = inspector.get('model'),
          charmUrl = service.get('charm'),
          charm = db.charms.getById(charmUrl),
          schema = charm.get('options'),
          container = this.get('container'),
          button = container.one('button.confirm');

      button.set('disabled', 'disabled');

      var config = utils.getElementsValuesMapping(container, '.config-field');
      var errors = utils.validate(config, schema);

      if (Y.Object.isEmpty(errors)) {
        env.set_config(
            service.get('id'),
            config,
            null,
            service.get('config'),
            Y.bind(this._setConfigCallback, this, container)
        );
      } else {
        db.notifications.add(
            new models.Notification({
              title: 'Error saving service config',
              message: 'Error saving service config',
              level: 'error'
            })
        );
        // We don't have a story for passing the full error messages
        // through so will log to the console for now.
        console.log('Error setting config', errors);
      }
    },

    /**
      Handles the success or failure of setting the new config values

      @method _setConfigCallback
      @param {Y.Node} container of the viewlet-manager.
      @param {Y.EventFacade} evt YUI event object with the following attrs:
        - err: whether or not an error occurred;
        - service_name: the name of the service;
        - newValues: an object including the modified config options.
    */
    _setConfigCallback: function(container, evt) {
      // If the user has conflicted fields and still chooses to
      // save, then we will be overwriting the values in Juju.
      if (evt.err) {
        var db = this.viewletManager.get('db');
        db.notifications.add(
            new models.Notification({
              title: 'Error setting service configuration',
              message: 'Service name: ' + evt.service_name,
              level: 'error'
            })
        );
      } else {
        this._highlightSaved(container);
        var service = this.viewletManager.get('model');
        // Mix the current config (stored in the db) with the modified options.
        var config = Y.mix(service.get('config'), evt.newValues, true);
        service.set('config', config);
        var bindingEngine = this.viewletManager.bindingEngine;
        bindingEngine.resetDOMToModel('config');
      }
      container.one('.controls .confirm').removeAttribute('disabled');
    },

    /**
      Cancel any configuration changes.

      @method cancelConfig
      @param {Y.EventFacade} e An event object.
      @return {undefined} Nothing.
    */
    cancelConfig: function(e) {
      this.viewletManager.bindingEngine.resetDOMToModel('config');
    },

    /**
      Highlight modified fields to show they have been saved.
      Note that the "modified" class is removed in the syncedFields method.

      @method _highlightSaved
      @param {Y.Node} container The affected viewlet container.
      @return {undefined} Nothing.
    */
    _highlightSaved: function(container) {
      var modified = container.all('.modified');
      modified.addClass('change-saved');
      // If you don't remove the class later, the animation runs every time
      // you switch back to the tab with these fields. Unfortunately,
      // animationend handlers don't work reliably, once you hook them up with
      // the associated custom browser names (e.g. webkitAnimationEnd) on the
      // raw DOM node, so we don't even bother with them.  We just make a
      // timer to remove the class.
      var parentContainer = this.viewletManager.get('container');
      Y.later(1000, modified, function() {
        // Use the modified collection that we originally found, but double
        // check that our expected context is still around.
        if (parentContainer.inDoc() &&
            !container.all('.change-saved').isEmpty()) {
          this.removeClass('change-saved');
        }
      });
    },

    /**
      Handles the click on the file input and dispatches to the proper function
      depending if a file has been previously loaded or not.

      @method handleFileClick
      @param {Y.EventFacade} e An event object.
    */
    handleFileClick: function(e) {
      if (e.currentTarget.getHTML().indexOf('Remove') === -1) {
        // Because we can't style file input buttons properly we style a normal
        // element and then simulate a click on the real hidden input when our
        // fake button is clicked.
        e.container.one('input[type=file]').getDOMNode().click();
      } else {
        this.onRemoveFile(e);
      }
    },

    /**
      Handle the file upload click event. Creates a FileReader instance to
      parse the file data.


      @method onFileChange
      @param {Y.EventFacade} e An event object.
    */
    handleFileChange: function(e) {
      var file = e.currentTarget.get('files').shift(),
          reader = new FileReader();
      reader.onerror = Y.bind(this.onFileError, this);
      reader.onload = Y.bind(this.onFileLoaded, this, file.name);
      reader.readAsText(file);
    },


    /**
      Callback called when an error occurs during file upload.
      Hide the charm configuration section.

      @method onFileError
      @param {Object} e An event object (with a "target.error" attr).
    */
    onFileError: function(e) {
      var error = e.target.error, msg;
      switch (error.code) {
        case error.NOT_FOUND_ERR:
          msg = 'File not found';
          break;
        case error.NOT_READABLE_ERR:
          msg = 'File is not readable';
          break;
        case error.ABORT_ERR:
          break; // noop
        default:
          msg = 'An error occurred reading this file.';
      }
      if (msg) {
        var db = this.viewletManager.get('db');
        db.notifications.add(
            new models.Notification({
              title: 'Error reading configuration file',
              message: msg,
              level: 'error'
            }));
      }
    },

    /**
      Callback called when a file is correctly uploaded.
      Hide the charm configuration section.

      @method onFileLoaded
      @param {Object} e An event object.
    */
    onFileLoaded: function(filename, e) {
      // Add a link for the user to remove this file now that it's loaded.
      var container = this.get('container');
      var button = container.one('.fakebutton');
      button.setHTML(filename + ' - Remove file');
      //set the configFileContent on the viewlet-manager so we can have access
      //to it when the user submit their config.
      this.viewletManager.configFileContent = e.target.result;
      if (!this.viewletManager.configFileContent) {
        // Some file read errors do not go through the error handler as
        // expected but instead return an empty string.  Warn the user if
        // this happens.
        var db = this.viewletManager.get('db');
        db.notifications.add(
            new models.Notification({
              title: 'Configuration file error',
              message: 'The configuration file loaded is empty.  ' +
                  'Do you have read access?',
              level: 'error'
            }));
      }
      container.all('.charm-settings, .settings-wrapper.toggle').hide();
    },

    /**
      Handle the file remove click event by clearing out the input
      and resetting the UI.

      @method onRemoveFile
      @param {Y.EventFacade} e an event object from click.
    */
    onRemoveFile: function(e) {
      var container = this.get('container');
      this.viewletManager.configFileContent = null;
      container.one('.fakebutton').setHTML('Import config file...');
      container.all('.charm-settings, .settings-wrapper.toggle').show();
      // Replace the file input node.  There does not appear to be any way
      // to reset the element, so the only option is this rather crude
      // replacement.  It actually works well in practice.
      container.one('input[type=file]')
               .replace(Y.Node.create('<input type="file"/>'));
    }

  });

}, '0.0.1', {
  requires: [
    'event-simulate',
    'juju-charm-models',
    'viewlet-base-view',
    'conflict-mixin',
    'juju-view',
    'node',
    'resizing-textarea'
  ]
});
