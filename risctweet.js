var Twit = require('twit');
var nThen = require('nthen');
var Fs = require('fs');
var Http = require('http');
var Qs = require("querystring");
var Conf = require('./config.js');

var getState = function (cb) {
    Fs.readFile(Conf.state, function (err, ret) {
        if (err && err.code === 'ENOENT') {
            cb({});
            return;
        }
        if (err) { throw err; }
        cb(JSON.parse(ret.toString('utf8')));
    });
};

var getProjData = function (cb) {
    var dataStr = '';
    var url = Conf.baseurl + '?' + Qs.stringify({
        outputSyntax: 'plain',
        collist: 'project,description,author,score,ranking',
        queryFilters: 'currentlanguage,hidden',
        limit: '1000',
        reqNo: '1',
        sort: 'project',
        dir: 'asc'
    });
    Http.request({
            hostname: Conf.hostname,
            port: Conf.port,
            path: url,
            method: 'GET'
        },
        function(res) {
            if (res.statusCode !== 200) {
                throw new Error('http ' + res.statusCode + ' ' + res.status);
            }
            res.setEncoding('utf8');
            res.on('data', function (chunk) { dataStr += chunk; });
            res.on('end', function () {
                cb(JSON.parse(dataStr));
            });
        }
    ).end();
};

var selectRndElem = function (state, data) {
    var candidates = [];
    var now = (new Date()).getTime();
    for (var i = 0; i < data.rows.length; i++) {
        var elem = data.rows[i];
        if (Conf.blacklist.indexOf(elem.entity_url.replace(/^.*\//, '')) !== -1) {
            continue;
        } else if (!(elem.entity_url in state)) {
        } else if (now - state[elem.entity_url].date > Conf.quietTime_ms) {
        } else {
            continue;
        }
        candidates.push(elem);
    }

    if (!candidates.length) { return; }

    return candidates[Math.floor(Math.random() * candidates.length)];
}

var extractData = function (elem) {
    return {
        shortName: decodeURIComponent(elem.entity_url.replace(/.*[\/_]/g, '')).replace(/[^a-zA-Z0-9_]/g, ''),
        rank: elem.ranking.replace(/.*<strong>|<\/strong>/g,''),
        score: elem.score,
        link: elem.project.replace(/<a href='/, 'http://' + Conf.hostname).replace(/' class='.*$/, ''),
        entity_url: elem.entity_url
    };
};

var mkTweet = function (dat) {
    return '#' + dat.shortName + ' scored ' + dat.score + ' on #riscoss, ' + dat.rank + ' ' + dat.link;
};

var sendTweet = function (tweet) {
    var twit = new Twit(Conf.twitconf);
    twit.post('statuses/update', { status: tweet }, function(err, data, response) {
        if (err) { throw err; }
        console.log('data>' + data);
        console.log('response>' + response);
    });
}

var run = function (args, cb) {
    var state = undefined;
    var data = undefined;
    nThen(function (waitFor) {

        getState(waitFor(function (st) { state = st; }));
        getProjData(waitFor(function (da) { data = da; }));

    }).nThen(function (waitFor) {
        if (args.all) {
            for (var i = 0; i < data.rows.length; i++) {
                var dat = extractData(data.rows[i]);
                console.log(dat.shortName + '  ' + dat.link);
            }
            return;
        }

        var elem = selectRndElem(state, data);
        if (!elem) { return; }
        var dat = extractData(elem);
        var tweet = mkTweet(dat);
        console.log(tweet);
        if (args.tweet) {
            sendTweet(tweet);
        }
        state[dat.entity_url] = { date: (new Date()).getTime() };
        Fs.writeFile(Conf.state, JSON.stringify(state), waitFor(function (err) {
            if (err) { throw err; }
        }));
    });
};

var usage = function () {
    console.log('riscotweet --all         # show all projects');
    console.log('riscotweet --dry         # display what is intended to be tweeted');
    console.log('riscotweet --tweet       # actually send the tweet');
}

var main = function (argv) {
    var args = {
        all: argv.indexOf('--all') !== -1,
        tweet: argv.indexOf('--tweet') !== -1,
        dry: argv.indexOf('--dry') !== -1
    };
    if (!args.all && !args.tweet && !args.dry) {
        usage();
    } else {
        run(args);
    }
};
main(process.argv);
