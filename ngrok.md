Terminal 1, backend:
cd c:\project\Echo\backend
npm start

Terminal 2, frontend:

cd c:\project\Echo\frontend
npm start


Terminal 3, ngrok:
ngrok http --url=disburse-siberian-countdown.ngrok-free.dev 3000

Then open:
https://disburse-siberian-countdown.ngrok-free.dev

If any old process is still holding a port, stop it first with:
taskkill /IM node.exe /F
taskkill /IM ngrok.exe /F
