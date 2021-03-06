/* eslint-env browser */

/* global Webex */ // from bundle.js

/* eslint-disable no-console */
/* eslint-disable require-jsdoc */

// Declare some globals that we'll need throughout.
let webex;
const userInfo = {roomsInitialized: false};
let initialEventsCache = [];
const initialRoomFetch = 30;
let haveFetchedAll = false;

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
  webex = Webex.init({
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

// Handle a button push on the "Initialize" button
document.getElementById('credentials').addEventListener('submit', (event) => {
  // Don't reload the page when we submit the form.
  event.preventDefault();

  // Authorize with token and update UI
  authorize()
    .then(() => {
      console.log('connected');
      // Fetch an initial set of 30 recent rooms for "fast" UI update
      webex.rooms.listWithReadStatus(initialRoomFetch)
        .then((rooms) => processInitialRoomStatus(rooms))
        .catch((e) => {
          console.error(`rooms.listWithReadStatus failed: ${e}`);
          updateStatus(false);
        });
      webex.people.get('me').then((me) => {
        userInfo.me = me;
        updateStatus(true, userInfo.me);
      });

      // Register for room events
      webex.rooms.listen()
        .then(() => {
          console.log('listening to room events');

          webex.rooms.on('updated', (room) => {
            console.log('room updated event');
            console.log(room);
            if (userInfo.roomsInitialized) {
              processRoomUpdated(room);
            }
            else {
              cacheEvent(room);
            }
          });
        })
        .catch((err) => {
          console.error(`error listening to rooms: ${err}`);
          updateStatus(false);
        });

      // Register for message events
      webex.messages.listen()
        .then(() => {
          console.log('listening to message events');
          webex.messages.on('created', (message) => {
            console.log('message created event:');
            console.log(message);
            if (userInfo.roomsInitialized) {
              processMessageCreated(message);
            }
            else {
              cacheEvent(message);
            }
          });
        })
        .catch((err) => {
          console.error(`error listening to messages: ${err}`);
          updateStatus(false);
        });

      // Register for membership events
      webex.memberships.listen()
        .then(() => {
          console.log('listening to membership events');
          webex.memberships.on('created', (membership) => {
            console.log('membership created event');
            console.log(membership);
            if (userInfo.roomsInitialized) {
              processMembershipCreated(membership);
            }
            else {
              cacheEvent(membership);
            }
          });
          webex.memberships.on('deleted', (membership) => {
            console.log('membership deleted event');
            console.log(membership);
            if (userInfo.roomsInitialized) {
              processMembershipDeleted(membership);
            }
            else {
              cacheEvent(membership);
            }
          });
          webex.memberships.on('seen', (membership) => {
            console.log('membership seen (read receipt) event');
            console.log(membership);
            if (userInfo.roomsInitialized) {
              processMembershipSeen(membership);
            }
            else {
              cacheEvent(membership);
            }
          });
        })
        .catch((err) => {
          console.error(`error listening to memberships: ${err}`);
          updateStatus(false);
        });
    })
    .catch((err) => {
      console.error(`cannot authorize: ${err}`);
      updateStatus(false);
    });
});

// Update the UI after login
function updateStatus(authorized, me = {}) {
  const status = document.getElementById('connection-status');

  if (authorized) {
    status.innerText = 'initialized';
    status.classList.remove('label-warning');
    status.classList.remove('label-error');
    status.classList.add('label-success');
    document.getElementById('connect').disabled = true;
    const msg = ('displayName' in me) ?
      `Looking up status of the ${initialRoomFetch} most recent spaces for ${me.displayName}.  This can take some time....` :
      `Looking up status of the ${initialRoomFetch} most recent spaces.  This can take some time....`;

    document.getElementById('initializing-message').innerText = msg;
  }
  else {
    status.innerText = 'unauthorized';
    status.classList.remove('label-warning');
    status.classList.add('label-error');
    document.getElementById('connect').disabled = false;
    document.getElementById('initializing-message').innerText = '';
  }
}

// Handle a button push on the "Mark as Read" button
document.getElementById('mark-as-read').addEventListener('submit', (event) => {
  // Don't reload the page when we submit the form.
  event.preventDefault();
  document.getElementById('mark-as-read-button').disabled = true;
  webex.memberships.updateLastSeen(userInfo.lastMessage.data)
    .catch((e) => console.error(`Failed to mark message as read ${e}`));
});

// Update the Table UI after we have initial room status
function updateSpaceTable(user) {
  // Setup the elements in the space info table
  document.getElementById('read-count').innerText = user.readSpacesCount;
  document.getElementById('last-read-space-title').innerText =
    user.lastRead.title;
  document.getElementById('last-read-space-current-members').innerText =
    user.lastRead.caughtUpMembersMsg;
  document.getElementById('last-read-space-behind-members').innerText =
    user.lastRead.behindMembersMsg;
  document.getElementById('unread-count').innerText =
    user.unreadSpacesCount;
  document.getElementById('last-unread-space-title').innerText =
    user.lastUnread.title;
  document.getElementById('last-unread-space-current-members').innerText =
    user.lastUnread.caughtUpMembersMsg;
  document.getElementById('last-unread-space-behind-members').innerText =
    user.lastUnread.behindMembersMsg;

  // Set up the elements in the read receipt table
  if ('data' in user.lastMembershipSeen) {
    document.getElementById('membership-seen-time').innerText =
      user.lastMembershipSeen.data.created;
    document.getElementById('membership-seen-user').innerText =
      user.lastMembershipSeen.data.personDisplayName;
    document.getElementById('membership-seen-space').innerText =
      user.lastMembershipSeen.data.roomTitle;
    document.getElementById('membership-seen-message').innerText =
      user.lastMembershipSeen.data.lastSeenId;
  }

  // Set up the elements in the last message table
  if ('data' in user.lastMessage) {
    document.getElementById('message-sent-time').innerText =
      user.lastMessage.created;
    document.getElementById('message-author').innerText =
      user.lastMessage.data.personEmail;
    document.getElementById('message-space').innerText =
      user.lastMessage.data.roomTitle;
    document.getElementById('message').innerText =
      user.lastMessage.data.text;
  }
}

async function processInitialRoomStatus(roomStates) {
  if (!('me' in userInfo)) {
    console.error('Failed to get authorized user person info.');

    return updateStatus(false);
  }
  // Parse the roomStates
  if ((!('items' in roomStates)) || (!Array.isArray(roomStates.items))) {
    console.error('No item array returned by the rooms.listWithReadStatus()!');

    return updateStatus(false);
  }
  // If we just did an initial "recent fetch", start the big one
  if (!userInfo.roomsInitialized) {
    if ((roomStates.items.length === initialRoomFetch) && (!haveFetchedAll)) {
      haveFetchedAll = true;
      webex.rooms.listWithReadStatus()
        .then((rooms) => {
          console.log(`Got full list of ${rooms.items.length} rooms...updating GUI`);
          // for simplicity, assume the initial processInitialRoomStatus completed
          // before the return from the second listWithReadStatus() call did
          processInitialRoomStatus(rooms);
        })
        .catch((e) => {
          console.error(`rooms.listWithReadStatus failed: ${e}`);
          updateStatus(false);
        });
    }
  }
  else {
    // cache events while we process the final list of rooms
    userInfo.roomsInitialized = false;
  }

  // Initialize the message and read receipt objects
  userInfo.lastMembershipSeen = {};
  userInfo.lastMessage = {};

  let msg = document.getElementById('initializing-message').innerText;

  msg += `<br>${userInfo.me.displayName} is a member of ${roomStates.items.length} spaces.  Calculating read states...`;
  document.getElementById('initializing-message').innerText = msg;

  // Generate the initial state
  userInfo.roomStates = [];
  userInfo.unreadSpacesCount = 0;
  userInfo.lastUnread = {};
  userInfo.readSpacesCount = 0;
  userInfo.lastRead = {};

  for (const roomState of roomStates.items) {
    // if (moment(roomState.lastActivityDate,moment.ISO_8601).valueOf() >
    //   moment(roomState.lastSeenDate,moment.ISO_8601).valueOf())
    if (roomState.lastActivityDate > roomState.lastSeenActivityDate) {
      userInfo.unreadSpacesCount += 1;
      roomState.isUnreadByMe = true;
      if ((!userInfo.lastUnread.id) ||
        (userInfo.lastUnread.lastActivityDate < roomState.lastActivityDate)) {
        userInfo.lastUnread.id = roomState.id;
        userInfo.lastUnread.lastActivityDate = roomState.lastActivityDate;
        userInfo.lastUnread.title = roomState.title ? roomState.title : '';
      }
    }
    else {
      userInfo.readSpacesCount += 1;
      roomState.isUnreadByMe = false;
      if ((!userInfo.lastRead.id) ||
        (userInfo.lastRead.lastSeenActivityDate < roomState.lastSeenActivityDate)) {
        userInfo.lastRead.id = roomState.id;
        userInfo.lastRead.lastSeenActivityDate = roomState.lastSeenActivityDate;
        userInfo.lastRead.lastActivityDate = roomState.lastActivityDate;
        userInfo.lastRead.title = roomState.title ? roomState.title : '';
      }
    }
    userInfo.roomStates.push(roomState);
  }

  // Get any membership info for the most recent spaces
  try {
    if ('id' in userInfo.lastUnread) {
      userInfo.lastUnread = await initMemberDetails(userInfo.lastUnread);
    }
    if ('id' in userInfo.lastRead) {
      userInfo.lastRead = await initMemberDetails(userInfo.lastRead);
    }
  }
  catch (e) {
    console.error('Failed to get details of most recent spaces');

    return updateStatus(false);
  }

  // Now process any cached messages
  await processInitialEventsCache();
  // Now we are ready to process any real time events
  userInfo.roomsInitialized = true;
  // Switch from the login page to the room state table...
  document.getElementById('header-one').innerText =
    `<h1>Read Status for ${userInfo.me.displayName}:<h1>`;
  document.getElementById('initial-login').style.display = 'none';
  document.getElementById('space-status').style.display = 'inline';

  return updateSpaceTable(userInfo);
}

async function processRoomUpdated(room) {
  try {
    // Update our cached room info if a space name has changed
    const {id} = room.data;
    const roomIdx = await getRoomIndex(id);
    const r = await webex.rooms.get(room.data);

    userInfo.roomStates[roomIdx].title = r.title;
    if (userInfo.lastUnread.id === r.id) {
      userInfo.lastUnread.title = r.title;
    }
    if (userInfo.lastRead.id === r.id) {
      userInfo.lastRead.title = r.title;
    }

    return updateSpaceTable(userInfo);
  }
  catch (e) {
    console.error(`Failed processing message:created event: ${e}`);

    return false;
  }
}

async function processMessageCreated(message) {
  try {
    if (!('data' in userInfo.lastMessage)) {
      // Hide the instructions on how to get a message after the first one
      document.getElementById('pre-message').style.display = 'none';
      document.getElementById('mark-as-read-button').style.display = 'inline';
    }
    userInfo.lastMessage = message;
    if (message.data.files) {
      userInfo.lastMessage.data.text = message.data.text ?
        `${message.data.text} &lt;and file attachments&gt;` : '&lt;file attachments&gt;';
    }
    const {roomId} = message.data;
    const roomIdx = await getRoomIndex(roomId);

    if (message.data.personId === userInfo.me.id) {
      document.getElementById('mark-as-read-button').disabled = true;
      // This is now the most recent read space
      userInfo.lastRead = await initMemberDetails({
        id: roomId,
        ...(userInfo.roomStates[roomIdx].title && {title: userInfo.roomStates[roomIdx].title}),
        lastActivityDate: message.created
      });
      userInfo.lastMessage.data.roomTitle = userInfo.lastRead.title;
      // Update the room status list
      userInfo.lastUnread = await updateRoomStatus(message, roomIdx, false);
    }
    else {
      document.getElementById('mark-as-read-button').disabled = false;
      // This is now the latest unread room
      userInfo.lastUnread = await initMemberDetails({
        id: message.data.roomId,
        ...(userInfo.roomStates[roomIdx].title && {title: userInfo.roomStates[roomIdx].title}),
        lastActivityDate: message.created
      });
      userInfo.lastMessage.data.roomTitle = userInfo.lastUnread.title;

      // Update the room status list
      userInfo.lastRead = await updateRoomStatus(message, roomIdx, true);
    }
    // Move this space to the front (most recent activity) of the array
    if (roomIdx > 0) {
      const latestRoom = userInfo.roomStates.splice(roomIdx, 1);

      userInfo.roomStates.unshift(latestRoom[0]);
    }

    return updateSpaceTable(userInfo);
  }
  catch (e) {
    console.error(`Failed processing message:created event: ${e}`);

    return false;
  }
}

async function processMembershipCreated(membership) {
  try {
    if (membership.data.personId !== userInfo.me.id) {
      if (membership.data.roomId === userInfo.lastRead.id) {
        userInfo.lastRead = addMemberToSpace(membership, userInfo.lastRead);
      }
      if (membership.data.roomId === userInfo.lastUnread.id) {
        userInfo.lastUnread = addMemberToSpace(membership, userInfo.lastUnread);
      }

      return updateSpaceTable(userInfo);
    }
    // We have been added to a space, add it to our list
    const newRoom = {
      id: membership.data.roomId,
      isUnreadByMe: true,
      lastActivityDate: membership.created
    };

    userInfo.lastUnread = await initMemberDetails(newRoom);
    newRoom.title = userInfo.lastUnread.title;
    newRoom.lastSeenActivityDate = 0;
    userInfo.unreadSpacesCount += 1;
    userInfo.roomStates.unshift(newRoom);

    return updateSpaceTable(userInfo);
  }
  catch (e) {
    console.error(`Failed processing membership:created event: ${e}`);

    return false;
  }
}

async function processMembershipDeleted(membership) {
  try {
    if (membership.data.personId !== userInfo.me.id) {
      if (membership.data.roomId === userInfo.lastRead.id) {
        userInfo.lastRead =
          removeMemberFromSpace(membership, userInfo.lastRead);
      }
      if (membership.data.roomId === userInfo.lastUnread.id) {
        userInfo.lastUnread =
          removeMemberFromSpace(membership, userInfo.lastUnread);
      }

      return updateSpaceTable(userInfo);
    }
    // We have been removed from a space, delete it from our list
    const {roomId} = membership.data;
    const roomIdx = await getRoomIndex(roomId);

    // Update the room status list
    if (userInfo.lastUnread.id === roomId) {
      userInfo.lastUnread = await updateRoomStatus(membership, roomIdx, false);
    }
    if (userInfo.lastRead.id === roomId) {
      userInfo.lastRead = await updateRoomStatus(membership, roomIdx, true);
    }
    if (userInfo.roomStates[roomIdx].isUnreadByMe) {
      userInfo.unreadSpacesCount -= 1;
    }
    else {
      userInfo.readSpacesCount -= 1;
    }
    userInfo.roomStates.splice(roomIdx, 1);

    return updateSpaceTable(userInfo);
  }
  catch (e) {
    console.error(`Failed processing membership:deleted event: ${e}`);

    return false;
  }
}

async function processMembershipSeen(membership) {
  try {
    if (!('data' in userInfo.lastMembershipSeen)) {
      // Hide the instructions on how to get a read receipt after the first one
      document.getElementById('initializing-membership').style.display = 'none';
    }
    userInfo.lastMembershipSeen = membership;
    // Get the space title for display on our form
    const {roomId} = membership.data;
    const roomIdx = await getRoomIndex(roomId);

    if ('title' in userInfo.roomStates[roomIdx]) {
      userInfo.lastMembershipSeen.data.roomTitle =
        userInfo.roomStates[roomIdx].title;
    }
    else {
      const room =
        await webex.rooms.get(userInfo.lastMembershipSeen.data.roomId);

      userInfo.lastMembershipSeen.data.roomTitle = room.title;
    }

    if (membership.actorId === userInfo.me.id) {
      // I sent a read receipt for this room, add it to the read list
      if (userInfo.lastRead.lastActivityDate < userInfo.lastUnread.lastActivityDate) {
        // This is now the most recent read space
        userInfo.lastRead = userInfo.lastUnread;
        updateMemberDetails(membership, userInfo.lastUnread);
      }
      // and find the next most recent unread space for the table
      userInfo.lastUnread = await updateRoomStatus(membership, roomIdx, false);
    }
    else {
      // Update member read status if we are showing this space
      if (roomId === userInfo.lastUnread.id) {
        updateMemberDetails(membership, userInfo.lastUnread);
      }
      if (roomId === userInfo.lastRead.id) {
        updateMemberDetails(membership, userInfo.lastRead);
      }
    }


    return updateSpaceTable(userInfo);
  }
  catch (e) {
    console.error(`Failed processing membership:seen event: ${e}`);

    return false;
  }
}


// Calls the new memberships.listWithReadStatus ap
// to get the read status of a spaces members
async function initMemberDetails(roomToUpdate) {
  const roomInfo = roomToUpdate;
  const membershipPromise =
    webex.memberships.listWithReadStatus({roomId: roomInfo.id});

  if (!roomInfo.title) {
    const room = await webex.rooms.get({id: roomInfo.id});

    roomInfo.title = room.title;
  }
  roomInfo.memberList = [];
  const memberships = await membershipPromise;

  roomInfo.memberList = memberships.items;

  return buildMemberReadMessages(roomInfo);
}

function updateMemberDetails(membership, roomToUpdate) {
  try {
    const roomInfo = roomToUpdate;
    // Get the member info
    const {personId} = membership.data;
    const memberIdx =
      roomInfo.memberList.findIndex((x) => x.personId === personId);

    roomInfo.memberList[memberIdx].lastSeenActivityDate = membership.created;

    return buildMemberReadMessages(roomInfo);
  }
  catch (e) {
    console.error(`Failed to update other member's read status: ${e}`);

    return roomToUpdate;
  }
}

function addMemberToSpace(membership, roomToUpdate) {
  const roomInfo = roomToUpdate;
  const newMember = membership.data;

  newMember.lastSeenActivityDate = 0;
  newMember.lastActivityDate = 0;
  roomInfo.memberList.push(membership.data);

  return buildMemberReadMessages(roomInfo);
}

function removeMemberFromSpace(membership, roomToUpdate) {
  const roomInfo = roomToUpdate;
  // Get the member info
  const {personId} = membership.data;
  const memberIdx =
    roomInfo.memberList.findIndex((x) => x.personId === personId);

  roomInfo.memberList.splice(memberIdx, 1);

  return buildMemberReadMessages(roomInfo);
}

function buildMemberReadMessages(roomToUpdate) {
  const roomInfo = roomToUpdate;

  roomInfo.countBehindMembers = 0;
  roomInfo.countCaughtUpMembers = 0;
  roomInfo.behindMembersMsg = '';
  roomInfo.caughtUpMembersMsg = '';
  for (const membership of roomInfo.memberList) {
    if (membership.personId !== userInfo.me.id) {
      if (!('lastSeenDate' in membership) ||
      (membership.lastSeenDate < roomInfo.lastActivityDate)) {
        if (!roomInfo.countBehindMembers) {
          roomInfo.behindMembersMsg = membership.personDisplayName;
        }
        if (roomInfo.countBehindMembers === 1) {
          roomInfo.behindMembersMsg += `, ${membership.personDisplayName}`;
        }
        roomInfo.countBehindMembers += 1;
      }
      else {
        if (!roomInfo.countCaughtUpMembers) {
          roomInfo.caughtUpMembersMsg = membership.personDisplayName;
        }
        if (roomInfo.countCaughtUpMembers === 1) {
          roomInfo.caughtUpMembersMsg += `, ${membership.personDisplayName}`;
        }
        roomInfo.countCaughtUpMembers += 1;
      }
    }
  }
  if (roomInfo.countBehindMembers > 2) {
    roomInfo.behindMembersMsg +=
      `, and ${roomInfo.countBehindMembers - 2} more`;
  }
  if (roomInfo.countCaughtUpMembers > 2) {
    roomInfo.caughtUpMembersMsg +=
      `, and ${roomInfo.countCaughtUpMembers - 2} more`;
  }

  return roomInfo;
}

// Update the array of rooms based on the most recent event
// Return the new 'latest' read/unread room as needed
async function updateRoomStatus(event, roomIdx, isUnreadByMe) {
  let newLatestRoom = {
    title: '',
    behindMembers: '',
    caughtUpMembers: ''
  };

  if (userInfo.roomStates[roomIdx].isUnreadByMe !== isUnreadByMe) {
    // We have a change in status for a space update the tables
    userInfo.roomStates[roomIdx].isUnreadByMe = isUnreadByMe;
    if (isUnreadByMe === false) {
      userInfo.readSpacesCount += 1;
      userInfo.unreadSpacesCount -= 1;
    }
    else {
      userInfo.readSpacesCount -= 1;
      userInfo.unreadSpacesCount += 1;
    }
    if (((!isUnreadByMe) && (userInfo.unreadSpacesCount > 0)) ||
    ((isUnreadByMe) && (userInfo.readSpacesCount > 0))) {
      const newIdx =
        userInfo.roomStates.findIndex((x) => x.isUnreadByMe !== isUnreadByMe);

      newLatestRoom = await initMemberDetails({
        id: userInfo.roomStates[newIdx].id,
        ...(userInfo.roomStates[newIdx].title && {title: userInfo.roomStates[newIdx].title}),
        lastActivityDate: userInfo.roomStates[newIdx].lastActivityDate
      });
    }
  }
  // The room state has not changed so we return the existing "latest"
  else if (!isUnreadByMe) {
    newLatestRoom = userInfo.lastUnread;
  }
  else {
    newLatestRoom = userInfo.lastRead;
  }

  return newLatestRoom;
}

function cacheEvent(event) {
  initialEventsCache.push(event);
}

// Helper function to find index for a room with activity
async function getRoomIndex(id) {
  try {
    let roomIdx =
    userInfo.roomStates.findIndex((x) => x.id === id);

    if (roomIdx === -1) {
      // It is possible that we have missed a room
      // rooms.listWithReadStatus is "lossy", for example,
      // if a room was created after we called it but
      // before it returned.  Try to find the room now
      const roomState = await webex.rooms.getWithReadStatus(id);

      if (roomState.lastActivityDate > roomState.lastSeenActivityDate) {
        userInfo.unreadSpacesCount += 1;
        roomState.isUnreadByMe = true;
      }
      else {
        userInfo.readSpacesCount += 1;
        roomState.isUnreadByMe = false;
      }
      userInfo.roomStates.unshift(roomState);
      roomIdx = 0;
    }

    return Promise.resolve(roomIdx);
  }
  catch (e) {
    console.error(`Failed to find room with ID${id}: ${e}`);

    return Promise.resolve(-1);
  }
}

// The initialEventsCache has events that occured
// after we queried for our initial rooms list
// but before we completed processing it
async function processInitialEventsCache() {
  try {
    for (const event of initialEventsCache) {
      switch (event.resource) {
        case ('rooms'):
          if (event.event === 'updated') {
            processRoomUpdated(event);
          }
          break;

        case ('messages'):
          if (event.event === 'created') {
            processMessageCreated(event);
          }
          break;

        case ('memberships'):
          if (event.event === 'seen') {
            processMembershipSeen(event);
          }
          else {
            const {roomId} = event.data;
            // eslint-disable-next-line no-await-in-loop
            const roomIdx = await getRoomIndex(roomId);

            if (event.event === 'created') {
              if (roomIdx === -1) {
                processMembershipCreated(event);
              }
            }
            if (event.event === 'deleted') {
              if (roomIdx >= 0) {
                processMembershipDeleted(event);
              }
            }
          }
          break;

        default:
          console.error(`Unexpected cached event ${event.resource}:${event.event}`);
      }
    }
  }
  catch (e) {
    console.error(`Failed to process cached Events: ${e}`);
  }

  initialEventsCache = [];
}
