// 푸시 알림만 처리한다. 문구는 서버(push 함수)가 암호화해서 보낸다.
self.addEventListener('push', e => {
  const m = e.data ? e.data.json() : { title: '한마디가 왔어요' };
  e.waitUntil(self.registration.showNotification(m.title, { body: m.body, icon: 'icon-192.png', tag: 'bubble' }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(ws => ws.length ? ws[0].focus() : clients.openWindow('./')));
});
