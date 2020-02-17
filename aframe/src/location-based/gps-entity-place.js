AFRAME.registerComponent('gps-entity-place', {
    _cameraGps: null,
    _scaleFound: false,
    _scale: null,
    _markerDistFromGroundFound: false,
    _markerDistFromGround: null,
    _gpsCoords: null,
    _cameraCurrentLong: null,
    _cameraCurrentLat: null,
    _positionXDebug: null,
    schema: {
        latitude: {
            type: 'number',
            default: 0,
        },
        longitude: {
            type: 'number',
            default: 0,
        },
        offsetY: {
            type: 'number',
            default: 0,
        }
    },
    init: function () {
        this._positionXDebug = 0;
        this.el.setAttribute('position', {x:0, y:0, z:0});

        this.debugUIAddedHandler = function () {
            this.setDebugData(this.el);
            window.removeEventListener('debug-ui-added', this.debugUIAddedHandler.bind(this));
        };

        window.addEventListener('debug-ui-added', this.debugUIAddedHandler.bind(this));
        return true;
    },

    /**
     * Update place position
     * @returns {void}
     */
    tick: function () {
        if (this._cameraGps === null) {
            var camera = document.querySelector('[gps-camera]');
            if (!camera || camera.components['gps-camera'] === undefined) {
                return;
            }
            this._cameraGps = camera.components['gps-camera'];
        }

        if (!this._scaleFound) {
            this._scale = 1;
            var scale = document.querySelector('[scale]');
            if (scale && scale.components['scale'] !== undefined && scale.components['scale'] !== null) {
                this._scale = scale.components['scale'].attrValue.y;
                this._scaleFound = true;
            }
        }

        if (!this._markerDistFromGroundFound) {
            this._markerDistFromGround = 0;
            var dist = document.querySelector('[distFromGround]');
            if (dist && dist.getAttribute('distFromGround') !== undefined && dist.getAttribute('distFromGround') !== null) {
                this._markerDistFromGround = parseFloat(dist.getAttribute('distFromGround'));
                this._markerDistFromGroundFound = true;
            }
        }

        if (!this._cameraGps) return;
        if (!this._cameraGps.originCoords) return;

        this._gpsCoords =  this._cameraGps.currentCoords;

        if (this._gpsCoords.longitude !== this._cameraCurrentLong || this._gpsCoords.latitude !== this._cameraCurrentLat) {
            this._cameraCurrentLong = this._gpsCoords.longitude;
            this._cameraCurrentLat = this._gpsCoords.latitude;

            // update position.x
            var dstCoords = {
                longitude: this.data.longitude,
                latitude: this._gpsCoords.latitude,
            };

            var x = this._cameraGps.computeDistanceMeters(this._gpsCoords, dstCoords, true);
            this._positionXDebug = x;
            x *= this.data.longitude > this._gpsCoords.longitude ? 1 : -1;

            // update position.z
            dstCoords = {
                longitude: this._gpsCoords.longitude,
                latitude: this.data.latitude,
            };

            var z = this._cameraGps.computeDistanceMeters(this._gpsCoords, dstCoords, true);
            z *= this.data.latitude > this._gpsCoords.latitude ? -1 : 1;

            var position = this.el.getAttribute('position');

            var y = this._markerDistFromGround;
            if(this.data.offsetY && this.data.offsetY > 0) {
                y += this.data.offsetY * this._scale;
            }
            position.y = y;

            // update element's position in 3D world
            position.x = this._deflickerLinear(x, position.x, 0.1);
            position.z = this._deflickerLinear(z, position.z, 0.1);
            this.el.setAttribute('position', position);

            var rotation = Math.atan2(position.x, position.z);
            this.el.object3D.rotation.y = rotation + Math.PI;
        }
    },

    _deflickerLinear: function (newValue, oldValue, bias) {
      if (oldValue === undefined || !this.data.smoothCamera) return newValue;
      return (newValue * bias + oldValue * (1 - bias));
    },

    /**
     * Set places distances from user on debug UI
     * @returns {void}
     */
    setDebugData: function (element) {
        var elements = document.querySelectorAll('.debug-distance');
        elements.forEach(function(el) {
            var distance = formatDistance(this._positionXDebug);
            if (element.getAttribute('value') == el.getAttribute('value')) {
                el.innerHTML = el.getAttribute('value') + ': ' + distance + 'far';
            }
        });
    }
});

/**
 * Format distances string
 *
 * @param {String} distance
 */
function formatDistance(distance) {
    distance = distance.toFixed(0);

    if (distance >= 1000) {
        return (distance / 1000) + ' kilometers';
    }

    return distance + ' meters';
};
