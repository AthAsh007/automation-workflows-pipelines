// The notification was accepted by the endpoint. Recorded as its own step so an execution
// shows plainly whether the team was told, separately from whether Zoho was written.
return [{
  json: {
    _outcome: 'team notified',
    _reason: 'the notification endpoint accepted the post'
  }
}];
