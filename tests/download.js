var fs = require('fs')
var path = require('path')
var os = require('os')
var test = require('tape')
var rimraf = require('rimraf')
var mkdirp = require('mkdirp')

var dat = require('..')

// os x adds this if you view the fixtures in finder and breaks the file count assertions
try { fs.unlinkSync(path.join(__dirname, 'fixtures', '.DS_Store')) } catch (e) { /* ignore error */ }

var downloadDat
var downloadDir
var shareDat
var shareKey
var fixtures = path.join(__dirname, 'fixtures')
var stats = {
  filesTotal: 2,
  bytesTotal: 1441
}

test('prep', function (t) {
  rimraf.sync(path.join(fixtures, '.dat')) // for previous failed tests
  dat(fixtures, function (err, node) {
    t.error(err, 'no error')
    shareDat = node
    shareDat.share(function (err) {
      t.error(err, 'no share error')
    })
    shareDat.on('key', function (key) {
      console.log('key is', key)
      shareKey = key
      t.end()
    })
  })
})

test('Download with default opts', function (t) {
  testFolder(function () {
    dat(downloadDir, {key: shareKey}, function (err, node) {
      t.error(err)
      downloadDat = node
      downloadDat.download(function (err) {
        t.error(err)
        t.fail('live archive should not call callback')
      })

      downloadDat.once('key', function (key) {
        t.ok(key, 'key emitted')
      })

      downloadDat.on('file-downloaded', function (entry) {
        t.skip('TODO: this is firing after file-downloaded')
      })

      downloadDat.once('download-finished', function () {
        t.same(downloadDat.stats.filesTotal, stats.filesTotal, 'files total match')
        t.same(downloadDat.stats.bytesTotal, stats.bytesTotal, 'bytes total match')
        // These are wrong b/c download-finished fires before the last download events
        t.skip(dat.stats.filesTotal, dat.stats.filesProgress, 'TODO: file total matches progress')
        t.skip(dat.stats.blocksTotal, dat.stats.blockProgress, 'TODO: block total matches progress')
        t.pass('download finished event')

        fs.readdir(downloadDir, function (_, files) {
          var hasCsvFile = files.indexOf('all_hour.csv') > -1
          var hasDatFolder = files.indexOf('.dat') > -1
          t.ok(hasDatFolder, '.dat folder created')
          t.ok(hasCsvFile, 'csv file downloaded')

          if (files.indexOf('folder') > -1) {
            var subFiles = fs.readdirSync(path.join(downloadDir, 'folder'))
            var hasEmtpy = subFiles.indexOf('empty.txt') > -1
            t.skip(hasEmtpy, 'empty.txt file downloaded')
            // TODO: known hyperdrive issue https://github.com/mafintosh/hyperdrive/issues/83
          }
          downloadDat.removeAllListeners()
          t.end()
        })
      })
    })
  })
})

test('download and live update', function (t) {
  updateShareFile()

  downloadDat.on('archive-updated', function () {
    t.pass('archive updated event')
  })

  downloadDat.on('file-downloaded', function (file) {
    t.ok(file.name.indexOf('empty.txt') > -1, 'file updated')
    t.end()
  })

  downloadDat.on('download-finished', function () {
    t.skip('TODO: download finished fires again')
    // t.end()
  })

  function updateShareFile () {
    fs.writeFileSync(path.join(fixtures, 'folder', 'empty.txt'), '')
  }
})

test('close first test', function (t) {
  shareDat.close(function () {
    downloadDat.close(function () {
      shareDat.db.close(function () {
        rimraf.sync(path.join(fixtures, '.dat'))
        t.end()
      })
    })
  })
})

test('download from snapshot', function (t) {
  var shareKey
  dat(fixtures, {snapshot: true}, function (err, node) {
    t.error(err, 'no error')
    shareDat.share(function (err) {
      t.erro(err, 'no share errors')
    })
    shareDat.once('key', function (key) {
      shareKey = key
      download()
    })
  })

  function download () {
    testFolder(function () {
      dat(downloadDir, {key: shareKey}, function (err, downDat) {
        t.error(err, 'no error')
        downDat.download(function (err) {
          t.error(err, 'download callback error')
          t.pass('callback called for non-live archive')
          fs.readdir(downloadDir, function (_, files) {
            var hasCsvFile = files.indexOf('all_hour.csv') > -1
            var hasDatFolder = files.indexOf('.dat') > -1
            t.ok(hasDatFolder, '.dat folder created')
            t.ok(hasCsvFile, 'csv file downloaded')

            downDat.close(function () {
              t.pass('close callback ok')
              t.end()
            })
          })
        })

        downDat.once('download-finished', function () {
          t.pass('download finished')
          t.ok(!downDat.live, 'live value false')
        })
      })
    })
  }
})

test('finished', function (t) {
  shareDat.close(function () {
    shareDat.db.close(function () {
      rimraf.sync(path.join(fixtures, '.dat'))
      t.end()
    })
  })
})

test.onFinish(function () {
  if (downloadDir) rimraf.sync(downloadDir)
})

function testFolder (cb) {
  // Delete old folder and make new one
  if (downloadDir && downloadDir.length) rimraf.sync(downloadDir)
  downloadDir = path.join(os.tmpdir(), 'dat-download-tests-' + new Date().getTime())
  mkdirp(downloadDir, cb)
}
