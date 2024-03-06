import * as fs from 'fs';
import Systray from '.';
(async () => {
  await Systray.install()
  const systray = new Systray({
    menu: {
      // use .png icon on posix & .ico on windows
      icon: fs.readFileSync(`${__dirname}/test-icons/icon.${process.platform === 'win32' ? 'ico' : 'png'}`).toString('base64'),
      title: "Test",
      tooltip: "Tips",
      items: [{
        title: "checkable",
        tooltip: "This can be checked & unchecked",
        checked: true,
        enabled: true
      }, {
        title: "thing",
        tooltip: "Click this to log stuff",
        enabled: true
      }, {
        title: "Exit",
        tooltip: "Quits the application",
        enabled: true
      }]
    },
  })

  systray.onClick(action => {
    if (action.seq_id === 0) {
      console.log('action', action)
      systray.sendAction({
        type: 'update-item',
        item: {
          ...action.item,
          checked: !action.item.checked,
        },
        seq_id: action.seq_id,
      })
    } else if (action.seq_id === 1) {
      // open the url
      console.log('open the url', action)
    } else if (action.seq_id === 2) {
      systray.kill()
      process.exit()
    }
  })
})()