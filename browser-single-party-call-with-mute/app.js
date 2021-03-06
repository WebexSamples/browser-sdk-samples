/* eslint-env browser */

/* global Webex */

/* eslint-disable camelcase */
/* eslint-disable max-nested-callbacks */
/* eslint-disable no-alert */
/* eslint-disable no-console */
/* eslint-disable require-jsdoc */
/* eslint-disable arrow-body-style */
/* eslint-disable max-len */

// Declare some globals that we'll need throughout
let activeMeeting, webex;

// First, let's wire our form fields up to localStorage so we don't have to
// retype things everytime we reload the page.

[
  'access-token',
  'invitee'
].forEach((id) => {
  const el = document.getElementById(id);

  el.value = localStorage.getItem(id);
  el.addEventListener('change', (event) => {
    localStorage.setItem(id, event.target.value);
  });
});

// There's a few different events that'll let us know we should initialize
// Webex and start listening for incoming calls, so we'll wrap a few things
// up in a function.
function connect() {
  return new Promise((resolve) => {
    if (!webex) {
      // eslint-disable-next-line no-multi-assign
      webex = window.webex = Webex.init({
        config: {
          logger: {
            level: 'debug'
          },
          meetings: {
            reconnection: {
              enabled: true
            }
          }
          // Any other sdk config we need
        },
        credentials: {
          access_token: document.getElementById('access-token').value
        }
      });
    }

    // Listen for added meetings
    webex.meetings.on('meeting:added', (addedMeetingEvent) => {
      if (addedMeetingEvent.type === 'INCOMING') {
        const addedMeeting = addedMeetingEvent.meeting;

        // Save meeting
        activeMeeting = addedMeeting;

        // Acknowledge to the server that we received the call on our device
        addedMeeting.acknowledge(addedMeetingEvent.type)
          .then(() => {
            if (confirm('Answer incoming call')) {
              joinMeeting(addedMeeting);
              bindMeetingEvents(addedMeeting);
            }
            else {
              addedMeeting.decline();
            }
          });
      }
    });

    // Register our device with Webex cloud
    if (!webex.meetings.registered) {
      webex.meetings.register()
        // Sync our meetings with existing meetings on the server
        .then(() => webex.meetings.syncMeetings())
        .then(() => {
          // This is just a little helper for our selenium tests and doesn't
          // really matter for the example
          document.body.classList.add('listening');
          document.getElementById('connection-status').innerText = 'connected';
          // Our device is now connected
          resolve();
        })
        // This is a terrible way to handle errors, but anything more specific is
        // going to depend a lot on your app
        .catch((err) => {
          console.error(err);
          // we'll rethrow here since we didn't really *handle* the error, we just
          // reported it
          throw err;
        });
    }
    else {
      // Device was already connected
      resolve();
    }
  });
}

// Similarly, there are a few different ways we'll get a meeting Object, so let's
// put meeting handling inside its own function.
function bindMeetingEvents(meeting) {
  // call is a call instance, not a promise, so to know if things break,
  // we'll need to listen for the error event. Again, this is a rather naive
  // handler.
  meeting.on('error', (err) => {
    console.error(err);
  });

  // Handle media streams changes to ready state
  meeting.on('media:ready', (media) => {
    if (!media) {
      return;
    }
    if (media.type === 'local') {
      document.getElementById('self-view').srcObject = media.stream;
      document.getElementById('microphone-state').innerText = 'on';
      document.getElementById('camera-state').innerText = 'on';
    }
    if (media.type === 'remoteVideo') {
      document.getElementById('remote-view-video').srcObject = media.stream;
      document.getElementById('camera-state-remote').innerText = 'on';
    }
    if (media.type === 'remoteAudio') {
      document.getElementById('remote-view-audio').srcObject = media.stream;
      document.getElementById('microphone-state-remote').innerText = 'on';
    }
  });

  // Handle media streams stopping
  meeting.on('media:stopped', (media) => {
    // Remove media streams
    if (media.type === 'local') {
      document.getElementById('self-view').srcObject = null;
      document.getElementById('microphone-state').innerText = 'off';
      document.getElementById('camera-state').innerText = 'off';
    }
    if (media.type === 'remoteVideo') {
      document.getElementById('remote-view-video').srcObject = null;
      document.getElementById('camera-state-remote').innerText = 'off';
    }
    if (media.type === 'remoteAudio') {
      document.getElementById('remote-view-audio').srcObject = null;
      document.getElementById('microphone-state-remote').innerText = 'off';
    }
  });

  // Update participant info
  meeting.members.on('members:update', (delta) => {
    const {full: membersData} = delta;
    const memberIDs = Object.keys(membersData);

    memberIDs.forEach((memberID) => {
      const memberObject = membersData[memberID];

      // Devices are listed in the memberships object.
      // We are not concerned with them in this demo
      if (memberObject.isUser) {
        if (memberObject.isSelf) {
          document.getElementById('call-status-local').innerText = memberObject.status;
        }
        else {
          document.getElementById('call-status-remote').innerText = memberObject.status;
        }
      }
    });
  });

  // Of course, we'd also like to be able to end the call:
  document.getElementById('hangup').addEventListener('click', () => {
    meeting.leave();
  });

  meeting.on('all', (event) => {
    console.log(event);
  });
}

// Join the meeting and add media
function joinMeeting(meeting) {
  return meeting.join().then(() => {
    return meeting.getSupportedDevices({
      sendAudio: true,
      sendVideo: true
    })
      .then(({sendAudio, sendVideo}) => {
        const mediaSettings = {
          receiveVideo: true,
          receiveAudio: true,
          receiveShare: false,
          sendShare: false,
          sendVideo,
          sendAudio
        };

        return meeting.getMediaStreams(mediaSettings).then((mediaStreams) => {
          const [localStream, localShare] = mediaStreams;

          meeting.addMedia({
            localShare,
            localStream,
            mediaSettings
          });
        });
      });
  });
}

// In order to simplify the state management needed to keep track of our button
// handlers, we'll rely on the current meeting global object and only hook up event
// handlers once.

document.getElementById('hangup').addEventListener('click', () => {
  if (activeMeeting) {
    activeMeeting.leave().then(() => {
      document.getElementById('microphone-state').innerText = 'off';
      document.getElementById('microphone-state-remote').innerText = 'off';
      document.getElementById('camera-state').innerText = 'off';
      document.getElementById('camera-state-remote').innerText = 'off';
    });
  }
});

document.getElementById('start-sending-audio').addEventListener('click', () => {
  if (activeMeeting) {
    activeMeeting.unmuteAudio().then(() => {
      document.getElementById('microphone-state').innerText = 'on';
    });
  }
});

document.getElementById('stop-sending-audio').addEventListener('click', () => {
  if (activeMeeting) {
    activeMeeting.muteAudio().then(() => {
      document.getElementById('microphone-state').innerText = 'off';
    });
  }
});

document.getElementById('start-sending-video').addEventListener('click', () => {
  if (activeMeeting) {
    activeMeeting.unmuteVideo().then(() => {
      document.getElementById('camera-state').innerText = 'on';
    });
  }
});

document.getElementById('stop-sending-video').addEventListener('click', () => {
  if (activeMeeting) {
    activeMeeting.muteVideo().then(() => {
      document.getElementById('camera-state').innerText = 'off';
    });
  }
});

// When changing the receiving status of a meeting,
// the quickest way that won't cause a renegotiation of
// audio/video is to simply mute the audio and hide
// the video element

document.getElementById('start-receiving-audio').addEventListener('click', () => {
  document.getElementById('remote-view-audio').play();
  document.getElementById('microphone-state-remote').innerText = 'on';
});

document.getElementById('stop-receiving-audio').addEventListener('click', () => {
  document.getElementById('remote-view-audio').pause();
  document.getElementById('microphone-state-remote').innerText = 'off';
});

document.getElementById('start-receiving-video').addEventListener('click', () => {
  document.getElementById('remote-view-video').style.visibility = 'visible';
  document.getElementById('camera-state-remote').innerText = 'on';
});

document.getElementById('stop-receiving-video').addEventListener('click', () => {
  document.getElementById('remote-view-video').style.visibility = 'hidden';
  document.getElementById('camera-state-remote').innerText = 'off';
});

// Now, let's set up incoming call handling
document.getElementById('credentials').addEventListener('submit', (event) => {
  // let's make sure we don't reload the page when we submit the form
  event.preventDefault();

  // The rest of the incoming call setup happens in connect();
  connect();
});

// And finally, let's wire up dialing
document.getElementById('dialer').addEventListener('submit', (event) => {
  // again, we don't want to reload when we try to dial
  event.preventDefault();

  const destination = document.getElementById('invitee').value;

  // we'll use `connect()` (even though we might already be connected or
  // connecting) to make sure we've got a functional webex instance.
  connect()
    .then(() => {
      // Create the meeting
      return webex.meetings.create(destination).then((meeting) => {
        // Save meeting
        activeMeeting = meeting;

        // Call our helper function for binding events to meetings
        bindMeetingEvents(meeting);

        // Pass the meeting to our join meeting helper
        return joinMeeting(meeting);
      });
    })
    .catch((error) => {
      // Report the error
      console.error(error);

      // Implement error handling here
    });
});
