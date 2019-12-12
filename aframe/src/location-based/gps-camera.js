AFRAME.registerComponent('gps-camera', {
    _watchPositionId: null,
    originCoords: null,
    currentCoords: null,
    newCoords: null,
    lookControls: null,
    heading: 0,
    newHeading: 0,
    pitch: 0,
    position: {x: 0, z: 0},

    schema: {
        positionMinAccuracy: {
            type: 'int',
            default: 100,
        },
        alert: {
            type: 'boolean',
            default: false,
        },
        minDistance: {
            type: 'int',
            default: 0,
        },
        smoothCamera: {
            type: 'number',
            default: 0,
        },
        latitude: {
          type: 'number',
          default: 0,
        },
        longitude: {
          type: 'number',
          default: 0,
        }
    },

    init: function () {
        if (this.el.components['look-controls'] === undefined) {
            return;
        }

        this.lookControls = this.el.components['look-controls'];

        // listen to deviceorientation event
        var eventName = this._getDeviceOrientationEventName();
        this._onDeviceOrientation = this._onDeviceOrientation.bind(this);

        // if Safari
        if (!!navigator.userAgent.match(/Version\/[\d.]+.*Safari/)) {
            // iOS 13+
            if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                var handler = function() {
                    console.log('Requesting device orientation permissions...')
                    DeviceOrientationEvent.requestPermission();
                    document.removeEventListener('touchend', handler);
                };

                document.addEventListener('touchend', function() { handler() }, false);

                if (this.data.alert) alert('After camera permission prompt, please tap the screen to active geolocation.');
            } else {
                var timeout = setTimeout(function () {
                    if (this.data.alert) alert('Please enable device orientation in Settings > Safari > Motion & Orientation Access.')
                }, 750);
                window.addEventListener(eventName, function () {
                    clearTimeout(timeout);
                });
            }
        }

        window.addEventListener(eventName, this._onDeviceOrientation, false);

        if (this.data.latitude && this.data.longitude) {
          var self = this;
            setInterval(function(){
              if (self.data.latitude === -1 || self.data.longitude === -1) return;
              self.newCoords = {latitude: self.data.latitude, longitude: self.data.longitude, accuracy: 0};
              if (!self.currentCoords) self.currentCoords = self.newCoords;
            }, 1000)
        } else {
            this._watchPositionId = this._initWatchGPS(function (position) {
                this.newCoords = position.coords;
                if (!self.currentCoords) self.currentCoords = self.newCoords;
            }.bind(this));
        }
    },

    tick: function () {
        this._updateRotation();
        this._updatePosition();
    },

    remove: function () {
        if (this._watchPositionId) {
            navigator.geolocation.clearWatch(this._watchPositionId);
        }
        this._watchPositionId = null;

        var eventName = this._getDeviceOrientationEventName();
        window.removeEventListener(eventName, this._onDeviceOrientation, false);
    },

    /**
     * Get device orientation event name, depends on browser implementation.
     * @returns {string} event name
     */
    _getDeviceOrientationEventName: function () {
        if ('ondeviceorientationabsolute' in window) {
            var eventName = 'deviceorientationabsolute'
        } else if ('ondeviceorientation' in window) {
            var eventName = 'deviceorientation'
        } else {
            var eventName = ''
            console.error('Compass not supported')
        }

        return eventName
    },

    /**
     * Get current user position.
     *
     * @param {function} onSuccess
     * @param {function} onError
     * @returns {Promise}
     */
    _initWatchGPS: function (onSuccess, onError) {
        if (!onError) {
            onError = function (err) {
                console.warn('ERROR(' + err.code + '): ' + err.message)

                if (err.code === 1) {
                    // User denied GeoLocation, let their know that
                    if (this.data.alert) alert('Please activate Geolocation and refresh the page. If it is already active, please check permissions for this website.');
                    return;
                }

                if (err.code === 3) {
                    if (this.data.alert) alert('Cannot retrieve GPS position. Signal is absent.');
                    return;
                }
            };
        }

        if ('geolocation' in navigator === false) {
            onError({ code: 0, message: 'Geolocation is not supported by your browser' });
            return Promise.resolve();
        }

        // https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/watchPosition
        return navigator.geolocation.watchPosition(onSuccess, onError, {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 27000,
        });
    },

    /**
     * Update user position.
     *
     * @returns {void}
     */
    _updatePosition: function () {
        if (!this.newCoords) return;

        var lat = this.currentCoords.latitude;
        var lng = this.currentCoords.longitude;

        this.currentCoords = this.newCoords;

        this.currentCoords.latitude = this._deflickerLinear(this.newCoords.latitude, lat, 0.01);
        this.currentCoords.longitude = this._deflickerLinear(this.newCoords.longitude, lng, 0.01);

        // don't update if accuracy is not good enough
        if (this.currentCoords.accuracy > this.data.positionMinAccuracy) {
            if (this.data.alert && !document.getElementById('alert-popup')) {
                var popup = document.createElement('div');
                popup.innerHTML = 'GPS signal is very poor. Try move outdoor or to an area with a better signal.'
                popup.setAttribute('id', 'alert-popup');
                document.body.appendChild(popup);
            }
            return;
        }

        var alertPopup = document.getElementById('alert-popup');
        if (this.currentCoords.accuracy <= this.data.positionMinAccuracy && alertPopup) {
            document.body.removeChild(alertPopup);
        }

        if (!this.originCoords) {
            this.originCoords = this.currentCoords;
        }

        // compute position.x
        var dstCoordsX = {
            longitude: this.currentCoords.longitude,
            latitude: this.originCoords.latitude,
        };
        this.position.x = this.computeDistanceMeters(this.originCoords, dstCoordsX);
        this.position.x *= this.currentCoords.longitude > this.originCoords.longitude ? 1 : -1;

        // compute position.z
        var dstCoordsZ = {
            longitude: this.originCoords.longitude,
            latitude: this.currentCoords.latitude,
        };
        this.position.z = this.computeDistanceMeters(this.originCoords, dstCoordsZ);
        this.position.z *= this.currentCoords.latitude > this.originCoords.latitude ? -1 : 1;

        var position = this.el.getAttribute('position');
        position.x = this._deflickerLinear(this.position.x, position.x, 0.1);
        position.z = this._deflickerLinear(this.position.z, position.z, 0.1);
        this.el.setAttribute('position', position);
    },

    /**
     * Returns distance in meters between source and destination inputs.
     *
     *  Calculate distance, bearing and more between Latitude/Longitude points
     *  Details: https://www.movable-type.co.uk/scripts/latlong.html
     *
     * @param {Position} src
     * @param {Position} dest
     * @param {Boolean} isPlace
     *
     * @returns {number} distance
     */
    computeDistanceMeters: function (src, dest, isPlace) {
        var dlongitude = THREE.Math.degToRad(dest.longitude - src.longitude);
        var dlatitude = THREE.Math.degToRad(dest.latitude - src.latitude);

        var a = (Math.sin(dlatitude / 2) * Math.sin(dlatitude / 2)) + Math.cos(THREE.Math.degToRad(src.latitude)) * Math.cos(THREE.Math.degToRad(dest.latitude)) * (Math.sin(dlongitude / 2) * Math.sin(dlongitude / 2));
        var angle = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        var distance = angle * 6378160;

        // if function has been called for a place, and if it's too near and a min distance has been set,
        // set a very high distance to hide the object
        if (isPlace && this.data.minDistance && this.data.minDistance > 0 && distance < this.data.minDistance) {
            return Number.MAX_SAFE_INTEGER;
        }

        return distance;
    },

    /**
     * Compute compass heading.
     *
     * @param {number} alpha
     * @param {number} beta
     * @param {number} gamma
     *
     * @returns {number} compass heading
     */
    _computeCompassHeading: function (alpha, beta, gamma) {

        // Convert degrees to radians
        var alphaRad = alpha * (Math.PI / 180);
        var betaRad = beta * (Math.PI / 180);
        var gammaRad = gamma * (Math.PI / 180);

        // Calculate equation components
        var cA = Math.cos(alphaRad);
        var sA = Math.sin(alphaRad);
        var sB = Math.sin(betaRad);
        var cG = Math.cos(gammaRad);
        var sG = Math.sin(gammaRad);

        // Calculate A, B, C rotation components
        var rA = - cA * sG - sA * sB * cG;
        var rB = - sA * sG + cA * sB * cG;

        // Calculate compass heading
        var compassHeading = Math.atan(rA / rB);

        // Convert from half unit circle to whole unit circle
        if (rB < 0) {
            compassHeading += Math.PI;
        } else if (rA < 0) {
            compassHeading += 2 * Math.PI;
        }

        // Convert radians to degrees
        compassHeading *= 180 / Math.PI;

        return compassHeading;
    },

    /**
     * Handler for device orientation event.
     *
     * @param {Event} event
     * @returns {void}
     */
    _onDeviceOrientation: function (event) {
        if (event.webkitCompassHeading !== undefined) {
            if (event.webkitCompassAccuracy < 50) {
                this.newHeading = event.webkitCompassHeading;
            } else {
                if (this.data.alert) console.warn('webkitCompassAccuracy is event.webkitCompassAccuracy');
            }
        } else if (event.alpha !== null) {
            if (event.absolute === true || event.absolute === undefined) {
                this.newHeading = this._computeCompassHeading(event.alpha, event.beta, event.gamma);
            } else {
              if (this.data.alert) console.warn('event.absolute === false');
            }
        } else {
          if (this.data.alert) console.warn('event.alpha === null');
        }
    },

    /**
     * Smoothes the value change based on the difference.
     *
     * @returns {number}
     */
    _deflicker: function (newValue, oldValue) {
        if (oldValue === undefined || !this.data.smoothCamera) return newValue;
        var difference = newValue - oldValue;
        if (difference > 180) oldValue += 360;
        if (difference < -180) newValue += 360;
        var bias = Math.atan(Math.abs((newValue - oldValue) / this.data.smoothCamera)) / (Math.PI / 2);
        return (newValue * bias + oldValue * (1 - bias)) % 360;
    },
    _deflickerLinear: function (newValue, oldValue, bias) {
        if (oldValue === undefined || !this.data.smoothCamera) return newValue;
        return (newValue * bias + oldValue * (1 - bias));
    },

    /**
     * Update user rotation data.
     *
     * @returns {void}
     */
    _updateRotation: function () {
        if (!this.data.smoothCamera) return; // rely on rotations from look-controls
        this.heading = this._deflicker(this.newHeading, this.heading);

        var pitchRotation = THREE.Math.radToDeg(this.el.object3D.rotation.x);
        this.pitch = this._deflicker(pitchRotation, this.pitch);
        this.el.object3D.rotation.x = THREE.Math.degToRad(this.pitch);

        var heading = 360 - this.heading;
        this.el.object3D.rotation.y = THREE.Math.degToRad(heading);
    }
});
