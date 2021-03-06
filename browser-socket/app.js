/* eslint-env browser */

/* global Webex */

/* eslint-disable no-console */
/* eslint-disable require-jsdoc */

// Declare some globals that we'll need throughout.
let webex;

// Save fields in localStorage so we don't have to retype them
// every time we reload the page.
[
  'access-token'
].forEach((id) => {
  const el = document.getElementById(id);

  el.value = localStorage.getItem(id);
  el.addEventListener('change', (event) => {
    localStorage.setItem(id, event.target.value);
  });
});

// Connect to Webex and listen for message events.
function authorize() {
  // eslint-disable-next-line no-multi-assign
  webex = window.webex = Webex.init({
    config: {

    },
    credentials: {
      access_token: document.getElementById('access-token').value
    }
  });

  if (webex.canAuthorize) {
    return Promise.resolve(webex.canAuthorize);
  }

  return Promise.reject(webex.canAuthorize);
}

// Update the UI.
function updateStatus(authorized) {
  const status = document.getElementById('connection-status');

  if (authorized) {
    status.innerText = 'initialized';
    status.classList.remove('label-warning');
    status.classList.remove('label-error');
    status.classList.add('label-success');
    document.getElementById('connect').disabled = true;
  }
  else {
    status.innerText = 'unauthorized';
    status.classList.remove('label-warning');
    status.classList.add('label-error');
  }
}

document.getElementById('credentials').addEventListener('submit', (event) => {
  // Don't reload the page when we submit the form.
  event.preventDefault();

  authorize()
    .then(() => {
      console.log('connected');
      webex.messages.listen()
        .then(() => {
          console.log('listening to message events');
          updateStatus(true);
          webex.messages.on('created', (message) => {
            console.log('message created event:');
            console.log(message);
          });
          webex.messages.on('deleted', (message) => {
            console.log('message deleted event:');
            console.log(message);
          });
        })
        .catch((err) => {
          console.error(`error listening to messages: ${err}`);
          updateStatus(false);
        });

      webex.attachmentActions.listen()
        .then(() => {
          console.log('listening to attachmentAction events');
          updateStatus(true);
          webex.attachmentActions.on('created', (attachmentAction) => {
            console.log('attachmentAction created event:');
            console.log(attachmentAction);
          });
        })
        .catch((err) => {
          console.error(`error listening to attachmentActions: ${err}`);
          updateStatus(false);
        });

      webex.memberships.listen()
        .then(() => {
          console.log('listening to membership events');
          updateStatus(true);
          webex.memberships.on('created', (membership) => {
            console.log('membership created event');
            console.log(membership);
          });
          webex.memberships.on('deleted', (membership) => {
            console.log('membership deleted event');
            console.log(membership);
          });
          webex.memberships.on('updated', (membership) => {
            console.log('membership updated event');
            console.log(membership);
          });
          webex.memberships.on('seen', (membership) => {
            console.log('membership seen (read receipt) event');
            console.log(membership);
          });
        })
        .catch((err) => {
          console.error(`error listening to memberships: ${err}`);
          updateStatus(false);
        });

      webex.rooms.listen()
        .then(() => {
          console.log('listening to room events');
          updateStatus(true);
          webex.rooms.on('created', (room) => {
            console.log('room created event');
            console.log(room);
          });
          webex.rooms.on('updated', (room) => {
            console.log('room updated event');
            console.log(room);
          });
        })
        .catch((err) => {
          console.error(`error listening to rooms: ${err}`);
          updateStatus(false);
        });
    })
    .catch((err) => {
      console.error(`cannot authorize: ${err}`);
    });
});
