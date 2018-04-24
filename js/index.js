function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

var MIN_NOTE = 48;
var MAX_NOTE = 84;
var NO_EVENT = -2;
var NOTE_OFF = -1;
var STEPS_PER_CHORD = 16;
var MODES = [[2, 2, 1, 2, 2, 2, 1], [2, 1, 2, 2, 2, 1, 2], [1, 2, 2, 2, 1, 2, 2], [2, 2, 2, 1, 2, 2, 1], [2, 2, 1, 2, 2, 1, 2], [2, 1, 2, 2, 1, 2, 2], [1, 2, 2, 1, 2, 2, 2]];
var KEYS = ["C4", "G3", "D4", "A3", "E4", "B3", "F#4", "C#4", "G#3", "D#4", "A#3", "F4"];

var key = Tone.Frequency(_.sample(KEYS)).toMidi();
var mode = _.sample(MODES);
var melodyLine = [];
var generatedChords = new Map();
var pendingActions = [];
var musicOutput = "internal";
var currentMIDIOutput = void 0;

Tone.Transport.bpm.value = 30;
Tone.context.latencyHint = "playback";

function buildScale(tonic, mode) {
  return mode.concat(mode).reduce(function (res, interval) {
    return res.concat([_.last(res) + interval]);
  }, [tonic]);
}

function getPitchChord(degree, tonic, mode) {
  var scale = buildScale(tonic, mode);
  var root = scale[degree];
  var third = _.includes(scale, root + 4) ? root + 4 : root + 3;
  var fifth = _.includes(scale, third + 4) ? third + 4 : third + 3;
  return [root % 12, third % 12, fifth % 12];
}

function getChordRootBasedOnLast(degree, tonic, mode, last) {
  var rootMid = buildScale(tonic, mode)[degree];
  var rootLow = rootMid - 12;
  var rootHigh = rootMid + 12;
  var options = [rootMid, rootLow, rootHigh].filter(function (n) {
    return n >= MIN_NOTE && n <= MAX_NOTE;
  });
  return Math.random() < 0.75 ? _.minBy(options, function (r) {
    return Math.abs(r - last);
  }) : _.sample(options);
}

// Melodies encoded in a one-hot vector, where 0 = no event, 1 = note off, the rest are note ons.
function encodeMelodyNote(note) {
  var idx = note < 0 ? note + 2 : note - MIN_NOTE + 2;
  return _.times(MAX_NOTE - MIN_NOTE + 2, function (i) {
    return i === idx ? 1 : 0;
  });
}
function decodeMelodyIndex(index) {
  if (index - 2 < 0) {
    return index - 2;
  } else {
    return index - 2 + MIN_NOTE;
  }
}

// Control chords encoded in a one-hot vector, where
// 0 = no chord,
// 1-13 = root pitch class,
// 14-25 = chord pitch classes,
// 26-38 = bass pitch class
function encodePitchChord(chord) {
  var oneHot = _.times(3 * 12 + 1, function () {
    return 0;
  });
  if (chord === null) {
    oneHot[0] = 1;
    return oneHot;
  }
  // Root pc
  oneHot[1 + chord[0]] = 1;
  // Pitches
  var _iteratorNormalCompletion = true;
  var _didIteratorError = false;
  var _iteratorError = undefined;

  try {
    for (var _iterator = chord[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
      var pc = _step.value;

      oneHot[1 + 12 + pc] = 1;
    }
    // Bass pc (=root)
  } catch (err) {
    _didIteratorError = true;
    _iteratorError = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion && _iterator.return) {
        _iterator.return();
      }
    } finally {
      if (_didIteratorError) {
        throw _iteratorError;
      }
    }
  }

  oneHot[1 + 12 + 12 + chord[0]] = 1;
  return oneHot;
}

// Beethoven's chord progression probabilities
// Culled from 

// 0 = I, 1 = ii, etc.
var chordProgressions = new Tone.CtrlMarkov({
  0: [{ value: 1, probability: 0.1 }, { value: 2, probability: 0.01 }, { value: 3, probability: 0.13 }, { value: 4, probability: 0.52 }, { value: 5, probability: 0.02 }, { value: 6, probability: 0.22 }],
  1: [{ value: 0, probability: 0.06 }, { value: 2, probability: 0.02 }, { value: 3, probability: 0.0 }, { value: 4, probability: 0.87 }, { value: 5, probability: 0.0 }, { value: 6, probability: 0.05 }],
  2: [{ value: 0, probability: 0.0 }, { value: 1, probability: 0.0 }, { value: 3, probability: 0.0 }, { value: 4, probability: 0.67 }, { value: 5, probability: 0.33 }, { value: 6, probability: 0.0 }],
  3: [{ value: 0, probability: 0.33 }, { value: 1, probability: 0.03 }, { value: 2, probability: 0.07 }, { value: 4, probability: 0.4 }, { value: 5, probability: 0.03 }, { value: 6, probability: 0.13 }],
  4: [{ value: 0, probability: 0.56 }, { value: 1, probability: 0.22 }, { value: 2, probability: 0.01 }, { value: 3, probability: 0.04 }, { value: 5, probability: 0.07 }, { value: 6, probability: 0.11 }],
  5: [{ value: 0, probability: 0.06 }, { value: 1, probability: 0.44 }, { value: 2, probability: 0.0 }, { value: 3, probability: 0.06 }, { value: 4, probability: 0.11 }, { value: 6, probability: 0.33 }],
  6: [{ value: 0, probability: 0.8 }, { value: 1, probability: 0.0 }, { value: 2, probability: 0.0 }, { value: 3, probability: 0.03 }, { value: 4, probability: 0.0 }, { value: 5, probability: 0.0 }]
});
chordProgressions.value = 0;

var math = dl.ENV.math;

var dropoutKeepProb = dl.Scalar.new(1.0);
var temperature = dl.Scalar.new(1.3);

// Using the Improv RNN pretrained model from https://github.com/tensorflow/magenta/tree/master/magenta/models/improv_rnn
var loader = new dl.CheckpointLoader("https://teropa.info/improv_rnn_pretrained_checkpoint/");
var lstm = void 0,
    state = void 0,
    output = void 0;
var rnnLoadPromise = loader.getAllVariables().then(function (vars) {
  lstm = {
    kernel1: vars["RNN/MultiRNNCell/Cell0/BasicLSTMCell/Linear/Matrix"],
    bias1: vars["RNN/MultiRNNCell/Cell0/BasicLSTMCell/Linear/Bias"],
    kernel2: vars["RNN/MultiRNNCell/Cell1/BasicLSTMCell/Linear/Matrix"],
    bias2: vars["RNN/MultiRNNCell/Cell1/BasicLSTMCell/Linear/Bias"],
    kernel3: vars["RNN/MultiRNNCell/Cell2/BasicLSTMCell/Linear/Matrix"],
    bias3: vars["RNN/MultiRNNCell/Cell2/BasicLSTMCell/Linear/Bias"],
    fullyConnectedBiases: vars["fully_connected/biases"],
    fullyConnectedWeights: vars["fully_connected/weights"]
  };
});

var lastGenerated = void 0;
function generateChord(chordDegree, key, mode) {
  var _this = this;

  var start = Date.now();
  if (!state) {
    state = [dl.Array2D.zeros([1, lstm.bias1.shape[0] / 4]), dl.Array2D.zeros([1, lstm.bias2.shape[0] / 4]), dl.Array2D.zeros([1, lstm.bias3.shape[0] / 4])];
  }

  if (!output) {
    output = [dl.Array2D.zeros([1, lstm.bias1.shape[0] / 4]), dl.Array2D.zeros([1, lstm.bias2.shape[0] / 4]), dl.Array2D.zeros([1, lstm.bias3.shape[0] / 4])];
  }

  return math.scope(function () {
    var _ref = _asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee(keep) {
      var lstm1, lstm2, lstm3, chords, last, i, melody, _i, input, nextOutput, outputH, weightedResult, logits, softmax, sampledOutput, fromChord;

      return regeneratorRuntime.wrap(function _callee$(_context) {
        while (1) {
          switch (_context.prev = _context.next) {
            case 0:
              lstm1 = math.basicLSTMCell.bind(math, dropoutKeepProb, lstm.kernel1, lstm.bias1);
              lstm2 = math.basicLSTMCell.bind(math, dropoutKeepProb, lstm.kernel2, lstm.bias2);
              lstm3 = math.basicLSTMCell.bind(math, dropoutKeepProb, lstm.kernel3, lstm.bias3);
              chords = _.times(STEPS_PER_CHORD, function () {
                return getPitchChord(chordDegree, key, mode);
              });
              last = key;

              if (!lastGenerated) {
                _context.next = 14;
                break;
              }

              i = lastGenerated.length - 1;

            case 7:
              if (!(i > 0)) {
                _context.next = 14;
                break;
              }

              if (!(lastGenerated[i] > 0)) {
                _context.next = 11;
                break;
              }

              last = lastGenerated[i];
              return _context.abrupt("break", 14);

            case 11:
              i--;
              _context.next = 7;
              break;

            case 14:
              melody = [getChordRootBasedOnLast(chordDegree, key, mode, last)];
              _i = 0;

            case 16:
              if (!(_i < chords.length - 1)) {
                _context.next = 40;
                break;
              }

              input = dl.Array1D.new(encodePitchChord(chords[_i + 1]).concat(encodeMelodyNote(melody[_i])));
              nextOutput = math.multiRNNCell([lstm1, lstm2, lstm3], input.as2D(1, -1), state, output);


              state.forEach(function (s) {
                return s.dispose();
              });
              output.forEach(function (o) {
                return o.dispose();
              });
              state = nextOutput[0];
              output = nextOutput[1];
              state.forEach(function (s) {
                return keep(s);
              });
              output.forEach(function (o) {
                return keep(o);
              });

              outputH = output[2];
              weightedResult = math.matMul(outputH, lstm.fullyConnectedWeights);
              logits = math.add(weightedResult, lstm.fullyConnectedBiases);
              softmax = math.softmax(math.divide(logits.as1D(), temperature));
              sampledOutput = math.multinomial(softmax, 1).asScalar();
              _context.t0 = melody;
              _context.t1 = decodeMelodyIndex;
              _context.next = 34;
              return sampledOutput.data();

            case 34:
              _context.t2 = _context.sent;
              _context.t3 = (0, _context.t1)(_context.t2);

              _context.t0.push.call(_context.t0, _context.t3);

            case 37:
              _i++;
              _context.next = 16;
              break;

            case 40:
              fromChord = { chordDegree: chordDegree, key: key, mode: mode };

              lastGenerated = melody;
              return _context.abrupt("return", melody.map(function (note, indexInChord) {
                return {
                  note: note,
                  indexInChord: indexInChord,
                  fromChord: fromChord
                };
              }));

            case 43:
            case "end":
              return _context.stop();
          }
        }
      }, _callee, _this);
    }));

    return function (_x) {
      return _ref.apply(this, arguments);
    };
  }());
}

function resetLstmState() {
  if (state) {
    state.forEach(function (s) {
      return s.dispose();
    });
    output.forEach(function (o) {
      return o.dispose();
    });
    state = null;
    output = null;
  }
}

// Impulse response from Hamilton Mausoleum http://www.openairlib.net/auralizationdb/content/hamilton-mausoleum
var reverb = new Tone.Convolver("https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/hm2_000_ortf_48k.mp3").toMaster();
reverb.wet = 0.4;

var samples = {
  C3: new Tone.Buffer("https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/harp-C4.mp3"),
  "D#3": new Tone.Buffer("https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/harp-Ds2.mp3"),
  "F#3": new Tone.Buffer("https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/harp-Fs2.mp3"),
  A3: new Tone.Buffer("https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/harp-A2.mp3"),
  C4: new Tone.Buffer("https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/harp-C3.mp3"),
  "D#4": new Tone.Buffer("https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/harp-Ds3.mp3"),
  "F#4": new Tone.Buffer("https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/harp-Fs3.mp3"),
  A4: new Tone.Buffer("https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/harp-A3.mp3"),
  C5: new Tone.Buffer("https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/harp-C4.mp3"),
  "D#5": new Tone.Buffer("https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/harp-Ds4.mp3"),
  "F#5": new Tone.Buffer("https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/harp-Fs4.mp3"),
  A5: new Tone.Buffer("https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/harp-A4.mp3"),
  C6: new Tone.Buffer("https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/harp-C5.mp3"),
  "D#6": new Tone.Buffer("https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/harp-Ds5.mp3"),
  "F#6": new Tone.Buffer("https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/harp-Fs5.mp3"),
  A6: new Tone.Buffer("https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/harp-A5.mp3")
};
var bassSamples = {
  C0: new Tone.Buffer("https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/bass-C0.mp3"),
  "D#0": new Tone.Buffer("https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/bass-Ds0.mp3"),
  "F#0": new Tone.Buffer("https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/bass-Fs0.mp3"),
  A0: new Tone.Buffer("https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/bass-A0.mp3")
};
var sampler = new Tone.Sampler(samples).connect(reverb);
var echoedSampler = new Tone.Sampler(samples).connect(new Tone.PingPongDelay("16n", 0.8).connect(reverb)).connect(reverb);
var bassSampler = new Tone.Sampler(bassSamples).connect(new Tone.Gain(0.6).connect(reverb));
var bassLowSampler = new Tone.Sampler(bassSamples).connect(new Tone.Gain(0.25).connect(reverb));

function generateNext(time) {
  if (!lstm) return;

  var _loop = function _loop() {
    var action = pendingActions.shift();
    var uiDelay = melodyLine.length * Tone.Time("16n").toSeconds();
    switch (action.type) {
      case "keyChange":
        key = action.key;
        resetLstmState();
        chordProgressions.value = 0;
        Tone.Draw.schedule(function () {
          setCurrentKeyInUI(key);
          action.onDone();
        }, time + uiDelay);
        break;
      case "modeChange":
        mode = action.mode;
        resetLstmState();
        chordProgressions.value = 0;
        Tone.Draw.schedule(function () {
          setCurrentModeInUI(mode);
          action.onDone();
        }, time + uiDelay);
        break;
    }
  };

  while (pendingActions.length) {
    _loop();
  }

  var chord = chordProgressions.value;
  chordProgressions.next();
  var mapKey = chord + "-" + key + "-" + mode;
  if (generatedChords.has(mapKey) && Math.random() < 0.6) {
    melodyLine = melodyLine.concat(generatedChords.get(mapKey));
    return Promise.resolve(true);
  } else {
    return generateChord(chord, key, mode).then(function (melody) {
      melodyLine = melodyLine.concat(melody);
      generatedChords.set(mapKey, melody);
    });
  }
}

var releasePrev = void 0,
    timeStep = 0;
function playNext(time) {
  if (melodyLine.length === 0) {
    return;
  }
  if (timeStep++ % STEPS_PER_CHORD === STEPS_PER_CHORD - 5) {
    generateNext(time);
  }

  var _melodyLine$shift = melodyLine.shift(),
      fromChord = _melodyLine$shift.fromChord,
      note = _melodyLine$shift.note,
      indexInChord = _melodyLine$shift.indexInChord;

  if (note !== -2 && note !== -1) {
    if (releasePrev) {
      releasePrev(time);
      releasePrev = null;
    }
    releasePrev = playNote(note, time);
  } else if (note === -1 && releasePrev) {
    releasePrev(time);
    releasePrev = null;
  }
  if (indexInChord === 0 || indexInChord === STEPS_PER_CHORD - 2) {
    var scale = buildScale(fromChord.key, fromChord.mode);
    var root = new Tone.Frequency(scale[fromChord.chordDegree] % 12 + 12, "midi").toNote();
    playBass(root, time, indexInChord === 0);
  }
}

function playNote(note, time) {
  if (musicOutput === "internal") {
    playInternal(note, time);
  } else {
    playMIDI(note, time);
  }
}

function playBass(note, time, upBeat) {
  if (musicOutput === "internal") {
    playInternalBass(note, time, upBeat);
  } else {
    playMIDIBass(note, time, upBeat);
  }
}

function playInternal(note, time) {
  var freq = Tone.Frequency(note, "midi");
  var echoed = Math.random() < 0.05;
  var smplr = echoed ? echoedSampler : sampler;
  smplr.triggerAttack(freq, time);
  if (echoed) {
    var _loop2 = function _loop2(i) {
      var t = time + Tone.Time("16n").toSeconds() * i;
      var amt = 1 / (i + 1);
      Tone.Draw.schedule(function () {
        return visualizePlay(note, amt);
      }, t);
    };

    for (var i = 0; i < 10; i++) {
      _loop2(i);
    }
  } else {
    Tone.Draw.schedule(function () {
      return visualizePlay(note, 1);
    }, time);
  }
  return function (t) {
    return smplr.triggerRelease(freq, t);
  };
}

function playInternalBass(note, time, upBeat) {
  if (upBeat) {
    bassSampler.triggerAttack(note, time);
  } else {
    bassLowSampler.triggerAttack(note, time);
  }
}

function playMIDI(note, time) {
  var delay = time - Tone.now();
  var playAt = delay > 0 ? "+" + delay * 1000 : undefined;
  var velocity = 0.8;
  currentMIDIOutput.playNote(note, 1, { velocity: velocity, time: playAt });
  Tone.Draw.schedule(function () {
    return visualizePlay(note, 1);
  }, time);
  return function (releaseTime) {
    var releaseDelay = releaseTime - Tone.now();
    var releaseAt = releaseDelay > 0 ? "+" + releaseDelay * 1000 : undefined;
    currentMIDIOutput.stopNote(note, 1, { time: releaseAt });
  };
}

function playMIDIBass(note, time, upBeat) {
  var delay = time - Tone.now();
  var playAt = delay > 0 ? "+" + delay * 1000 : undefined;
  var velocity = upBeat ? 0.8 : 0.6;
  var steps = upBeat ? STEPS_PER_CHORD - 2 : 2;
  var duration = steps * Tone.Time("16n").toSeconds() * 1000;
  if (currentMIDIOutput) {
    currentMIDIOutput.playNote(note, 2, { velocity: velocity, duration: duration, time: playAt });
  }
}

var vis = document.querySelector("#vis");
var keyButtons = Array.from(document.querySelectorAll(".key"));
var modeButtons = Array.from(document.querySelectorAll(".mode"));
var outputMenu = document.querySelector("#output");

WebMidi.enable(function (err) {
  if (!err) {
    var syncOutputs = function syncOutputs() {
      var prevOptions = Array.from(outputMenu.querySelectorAll("option"));
      prevOptions.forEach(function (option) {
        if (option.value !== "internal" && !_.find(WebMidi.outputs, { id: option.value })) {
          option.remove();
          if (musicOutput === option.value) {
            musicOutput = "internal";
          }
        }
      });
      WebMidi.outputs.forEach(function (output) {
        if (!_.find(prevOptions, function (o) {
          return o.value === output.id;
        })) {
          var option = document.createElement("option");
          option.value = output.id;
          option.textContent = "MIDI: " + output.name;
          outputMenu.appendChild(option);
        }
      });
    };

    syncOutputs();
    setInterval(syncOutputs, 5000);

    outputMenu.addEventListener("change", function () {
      musicOutput = outputMenu.value;
      if (musicOutput !== "internal") {
        currentMIDIOutput = WebMidi.getOutputById(musicOutput);
      } else {
        currentMIDIOutput = null;
      }
    });
  }
});

var noteEls = _.range(MIN_NOTE, MAX_NOTE).map(function (note) {
  var el = document.createElement("note");
  el.classList.add("note");
  vis.appendChild(el);
  return el;
});

function visualizePlay(note, amount) {
  var noteIdx = note - MIN_NOTE;
  if (noteIdx >= 0 && noteIdx < noteEls.length) {
    var noteEl = noteEls[noteIdx];
    var playEl = document.createElement("div");
    var routeLength = vis.offsetHeight + 20;
    playEl.classList.add("play");
    playEl.style.opacity = amount;
    noteEl.appendChild(playEl);
    var pathAnimation = playEl.animate([{ transform: "translateY(0)" }, { transform: "translateY(-" + routeLength + "px)" }], {
      duration: 60000,
      easing: "linear"
    });
    pathAnimation.onfinish = function () {
      return playEl.remove();
    };
    playEl.animate([{ opacity: amount }, { opacity: 0 }], {
      duration: 60000,
      easing: "ease-in",
      fill: "forwards"
    });
  }
}

function setCurrentKeyInUI(key) {
  var keyNote = Tone.Frequency(key, "midi").toNote();
  keyButtons.forEach(function (b) {
    return b.value === keyNote ? b.classList.add("current") : b.classList.remove("current");
  });
  document.body.className = "key-" + KEYS.indexOf(keyNote);
}

function setCurrentModeInUI(mode) {
  var modeIndex = "" + MODES.indexOf(mode);
  modeButtons.forEach(function (b) {
    return b.value === modeIndex ? b.classList.add("current") : b.classList.remove("current");
  });
}

keyButtons.forEach(function (keyButton) {
  return keyButton.addEventListener("click", function (evt) {
    keyButton.classList.add("pending");
    pendingActions.push({
      type: "keyChange",
      key: Tone.Frequency(evt.target.value).toMidi(),
      onDone: function onDone() {
        return keyButton.classList.remove("pending");
      }
    });
  });
});
modeButtons.forEach(function (modeButton) {
  return modeButton.addEventListener("click", function (evt) {
    modeButton.classList.add("pending"), pendingActions.push({
      type: "modeChange",
      mode: MODES[+evt.target.value],
      onDone: function onDone() {
        return modeButton.classList.remove("pending");
      }
    });
  });
});

var keyNote = Tone.Frequency(key, "midi").toNote();
var modeIndex = "" + MODES.indexOf(mode);
keyButtons.find(function (k) {
  return k.value === keyNote;
}).classList.add("current");
modeButtons.find(function (m) {
  return m.value === "" + modeIndex;
}).classList.add("current");
document.body.className = "key-" + KEYS.indexOf(keyNote);

var bufferLoadPromise = new Promise(function (res) {
  return Tone.Buffer.on("load", res);
});
Promise.all([rnnLoadPromise, bufferLoadPromise]).then(function () {
  document.querySelector("#loading").remove();
  generateNext(Tone.now());
  Tone.Transport.scheduleRepeat(playNext, "16n", "8n");
  Tone.Transport.start();
});
StartAudioContext(Tone.context, "#ui");