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


describe('machine view panel view', function() {
  var Y, container, machines, machine, models, utils, views, view, View;

  before(function(done) {
    Y = YUI(GlobalConfig).use(['machine-view-panel',
                               'juju-models',
                               'juju-views',
                               'juju-tests-utils',
                               'event-simulate',
                               'node-event-simulate',
                               'node'], function(Y) {

      models = Y.namespace('juju.models');
      utils = Y.namespace('juju-tests.utils');
      views = Y.namespace('juju.views');
      View = views.MachineViewPanelView;
      done();
    });
  });

  beforeEach(function() {
    container = utils.makeContainer(this, 'machine-view-panel');
    machine = new models.Machine({id: 0});
    machines = new models.MachineList();
    machines.add([machine]);
    // displayName is set on the machine object in the list; we also need to
    // set it on our standalone model.
    var displayName = machines.createDisplayName(machine.get('id'));
    machine.set('displayName', displayName);
    view = new View({container: container, machines: machines}).render();
  });

  afterEach(function() {
    view.destroy();
    container.remove(true);
  });

  it('should apply the wrapping class to the container', function() {
    assert.equal(container.hasClass('machine-view-panel'), true);
  });

  it('can set whether to be full width', function() {
    assert.equal(container.hasClass('full'), false);
    view.setWidthFull();
    assert.equal(container.hasClass('full'), true);
  });

  it('should render the header widgets', function() {
    assert.equal(container.one('.column .head .title').get('text'),
        'Unplaced units');
  });

  it('should render a list of machines', function() {
    var list = container.all('.machines .content li');
    assert.equal(list.size(), machines.size(),
                 'models are out of sync with displayed list');
    list.each(function(item, index) {
      var m = machines.item(index);
      assert.equal(item.get('text'), m.displayName,
                   'displayed item does not match model');
    });
  });

  it('should re-render when machines are added', function() {
    var selector = '.machines .content li',
        list = container.all(selector),
        id = 1;
    assert.equal(list.size(), machines.size(),
                 'initial displayed list is out of sync with machines');
    machines.add([new models.Machine({id: id, parentId: null})]);
    list = container.all(selector);
    assert.equal(list.size(), machines.size(),
                 'final displayed list is out of sync with machines');
    var addedItem = container.one(selector + '[data-id="' + id + '"]');
    assert.notEqual(addedItem, null,
                    'unable to find added machine in the displayed list');
  });

  it('should re-render when machines are deleted', function() {
    var selector = '.machines .content li',
        list = container.all(selector);
    assert.equal(list.size(), machines.size(),
                'initial displayed list is out of sync with machines');
    machines.remove(0);
    list = container.all(selector);
    assert.equal(list.size(), machines.size(),
                 'final displayed list is out of sync with machines');
    var deletedItem = container.one(selector + '[data-id="' + machine.get('id') + '"]');
    assert.equal(deletedItem, null,
                 'found the deleted machine still in the list');
  });

  it('should re-render when machines are updated', function() {
    var id = 999,
        m = machines.revive(0),
        selector = '.machines .content li',
        item = container.one(selector + '[data-id="' + m.get('id') + '"]');
    assert.notEqual(item, null, 'machine was not initially displayed');
    assert.equal(item.get('text'), machine.get('displayName'),
                 'initial machine names do not match');
    m.set('id', id);
    item = container.one(selector + '[data-id="' + id + '"]');
    assert.notEqual(item, null, 'machine was not displayed post-update');
    assert.equal(item.get('text'), machine.get('displayName'),
                 'machine names do not match post-update');
  });
});
