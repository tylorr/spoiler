var express = require('express'),
    app = express(),
    bodyParser = require('body-parser'),
    request = require('request'),
    args = process.argv.slice(2),
    clientId = args[0],
    clientSecret = args[1],
    token = args[2];

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static('static'));

app.get('/', function(req, res) {
  return res.sendFile(__dirname + '/index.html');
});

app.get('/auth', function(req, res) {
  if (req.query.error) {
    if (req.query.error === 'access_denied') {
      return res.redirect('/spoiler');
    } else {
      console.error(req.query.error);
      return res.sendStatus(500);
    }
  }

  request.post({
    url: 'https://slack.com/api/oauth.access',
    qs: {
      code: req.query.code
    },
    json: true,
  }, function(error, response, body) {
    if (error) {
      console.error(error);
      return res.sendStatus(500);
    }
    if (response.statusCode !== 200) {
      console.error(body);
      return res.sendStatus(500);
    }

    res.sendFile(__dirname + '/authorized.html')
  }).auth(clientId, clientSecret);
});

app.get('/spoil', function(req, res) {
  if (req.body.ssl_check === 1) {
    return res.sendStatus(200);
  }
});

var getSpoiledText = function(originalText) {
  var textNotToSpoil = '';
  var textToSpoil = originalText;

  var matches = originalText.match(/^\[(.*?)\](.*)$/i);
  if (matches) {
    textNotToSpoil = matches[1];
    textToSpoil = matches[2];
  }

  return {
    hidden: textNotToSpoil + textToSpoil.replace(/[^\s]/gi, '■'),
    actual: textNotToSpoil + textToSpoil
  }
};

app.post('/spoil', function(req, res) {
  if (req.body.token !== token) {
    return res.sendStatus(403);
  }

  if (req.body.text === '') {
    return res.status(400).send('You must have something to spoil');
  }

  var data = req.body;
  var spoil = getSpoiledText(data.text);

  var payload = {
    response_type: 'in_channel',
    attachments: [
      {
        text: spoil.hidden,
        footer: '<@' + data.user_id + '|' + data.user_name + '>'
      },
      {
        fallback: '<@' + data.user_id + '|' + data.user_name + '> spoiled some text',
        callback_id: 'spoil',
        attachment_type: 'default',
        actions: [{
          name: 'reveal',
          text: 'Reveal',
          type: 'button',
          value: spoil.actual
        }]
      }
    ]
  };

  request.post({
    url: req.body.response_url,
    body: payload,
    json: true
  }, 
  function(error, response, body) {
    if (error) {
      return console.error(error);
    }
    if (response.statusCode !== 200) {
      return console.error(body);
    }
  }).auth(clientId, clientSecret);

  res.status(200).send('');
});

app.post('/action', function(req, res) {
  var data = JSON.parse(req.body.payload);

  if (data.token !== token) {
    return res.sendStatus(403);
  }

  var action = data.actions[0];

  if (data.callback_id === 'spoil' && action.name === 'reveal') {
    var originalMessage = data.original_message.attachments[0];
    originalMessage.text = action.value;
    var payload = {
      response_type: 'ephemeral',
      replace_original: false,
      attachments: [originalMessage]
    };

    request.post({
      url: data.response_url,
      body: payload,
      json: true
    }, 
    function(error, response, body) {
      if (error) {
        return console.error(error);
      }
      if (response.statusCode !== 200) {
        return console.error(body);
      }
    }).auth(clientId, clientSecret);
  }
  res.status(200).send('');
});

var server = app.listen(26755, function() {});
