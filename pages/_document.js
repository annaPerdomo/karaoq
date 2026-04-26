import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="icon" href="/microphone.ico" />
        <meta name="theme-color" content="#0f0f23" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
