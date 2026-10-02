// craco.config.js
// Lets Create React App (react-scripts) pick up our postcss.config.js so
// Tailwind CSS can run. Nothing else about the CRA build is changed —
// `npm start` / `npm run build` behave exactly as before.
module.exports = {
  style: {
    postcss: {
      mode: 'file',
    },
  },
};
