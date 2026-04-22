import express, { Request, Response } from 'express';

const app = express();

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.get('/user', (req: Request, res: Response) => {
  res.json({ id: 1, name: 'arun', email: 'arunjangir9987@gmail.com' });
});

app.listen(3000, () => {
  console.log('Server started on port 3000');
});