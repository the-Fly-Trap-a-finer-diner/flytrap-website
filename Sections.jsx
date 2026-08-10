// About + Dishes + Retail + Press + Visit + Footer

function About() {
  return (
    <section id="about" className="section about" data-screen-label="About">
      <div className="container">
        <article className="about-editorial reveal">
          <header className="about-masthead">
            <div className="eyebrow">Buzzin' since 2004</div>
            <h2 className="title">Why 'The Fly Trap'?</h2>
            <p className="about-dateline">Ferndale, Michigan &middot; Est. December 28, 2004</p>
          </header>
          <div className="about-columns">
            <p className="about-body about-lead">The doors of The Fly Trap: a finer diner were eagerly thrown open for the first time on December 28th 2004. We welcomed our first customers and started our magnificent life as a business that continues on through today.</p>

            <p className="about-body">Along with our beloved and inquisitive customers came the many questions of our origin. The most important of which we will address right here and now… “Why?” they asked. “Why did you name your restaurant The Fly Trap?”</p>

            <blockquote className="about-pull">We always swore we would make up some exciting folklore tale of the origin of our now-venerated name, but we never quite came up with a story glorious enough to do justice to the wonderment.</blockquote>

            <p className="about-body about-lead">So now, in a moment of honesty, for the eyes of our website visitors ONLY, we give you the real skinny on the naming of our restaurant. We had been toiling arduously at the restaurant for many weeks when we knew it was time to give our creation a name. We took a small respite from our renovations and decided to brainstorm over a few cocktails. We wrote down many different names, and with whisky as our muse combined The Fly Trap, which we thought was a punchy homage to our predecessor, with a finer diner, which was a quick rhythmic summation of the vision for our creation.</p>

            <p className="about-body">We proceeded to have fun with the name by calling our specials the “daily buzz” and our carry-out business “on the fly”. We dreamed of being able to offer our “bar flies” a spirited buzz (now a reality!).</p>

            <blockquote className="about-pull">This was the point we knew we needn’t search any further, we had found our identity.</blockquote>

            <p className="about-body">Sure, we had to deal with the people that nobly declared “I would never eat at a place called The Fly Trap” and our family and friends thinking that we had a failure-wish, but we think with our unusual name we weeded out the closed-minded few and impressed the adventurous many with a bona fide finer diner. Our name also gets the credit for directing the attention of the Food Network’s Diners, Drive-Ins and Dives here to Ferndale, MI and put our little spot on the national map.</p>
          </div>
        </article>
      </div>
    </section>);

}

function DishScroll() {
  const dishes = window.FT_DATA.dishes || [];
  const trackRef = useRef(null);
  if (!dishes.length) return null;
  const nudge = (dir) => {
    const t = trackRef.current;
    if (!t) return;
    const card = t.querySelector(".dish-card");
    const step = card ? card.getBoundingClientRect().width + 18 : t.clientWidth * 0.8;
    t.scrollBy({ left: dir * step, behavior: "smooth" });
  };
  return (
    <section className="dishes" data-screen-label="Dishes">
      <div className="container">
        <div className="section-head center reveal" style={{ marginBottom: 24 }}>
          <h2 className="title" style={{ fontSize: 32 }}>A few of our favorites.</h2>
        </div>
      </div>
      <div className="dish-scroll">
        <button className="dish-nav prev" aria-label="Scroll to previous dishes" onClick={() => nudge(-1)}>‹</button>
        <div className="dish-track" ref={trackRef}>
          {dishes.map((d, i) =>
          <figure className="dish-card" key={i}>
              <img src={d.src} alt={d.label} width={d.w} height={d.h} loading="lazy" />
              <figcaption className="label">{d.label}</figcaption>
            </figure>
          )}
        </div>
        <button className="dish-nav next" aria-label="Scroll to more dishes" onClick={() => nudge(1)}>›</button>
      </div>
    </section>);

}

// Retail card whose product has multiple options (e.g. SWAT! sauces). Shows one
// option at a time — arrows + dots to click, swipe on touch — so three long blurbs
// no longer stack the card into a tall column. Each option reuses the card photo for
// now; swap in per-option images later by giving each variant its own `photo`.
function RetailCarousel({ card }) {
  const variants = card.variants;
  const n = variants.length;
  const [i, setI] = useState(0);
  const startX = useRef(null);
  const go = (d) => setI((p) => (p + d + n) % n);
  const onStart = (e) => { startX.current = e.touches[0].clientX; };
  const onEnd = (e) => {
    if (startX.current == null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    startX.current = null;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
  };
  const v = variants[i];
  const photo = v.photo || card.photo;
  return (
    <article className={"retail-card reveal carousel " + card.cls}>
      <div className="ph" onTouchStart={onStart} onTouchEnd={onEnd}>
        <img className="ph-img" src={photo} alt={v.name} loading="lazy" />
        <button type="button" className="car-nav prev" aria-label="Previous option" onClick={() => go(-1)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <button type="button" className="car-nav next" aria-label="Next option" onClick={() => go(1)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </button>
        <span className="car-count" aria-hidden="true">{i + 1} / {n}</span>
      </div>
      <div className="body">
        <h3>{card.title}</h3>
        <p className="car-name">{v.name}</p>
        <p className="desc">{v.desc}</p>
        <div className="car-dots" role="tablist" aria-label="Choose an option">
          {variants.map((vv, k) =>
          <button
            type="button"
            key={k}
            className={"car-dot" + (k === i ? " on" : "")}
            role="tab"
            aria-selected={k === i}
            aria-label={vv.name}
            onClick={() => setI(k)} />
          )}
        </div>
        {card.price || card.ask ?
        <div className="meta-row">
            {card.price ? <span className="price">{card.price}</span> : null}
            {card.ask ? <span className="ask">{card.ask}</span> : null}
          </div> :
        null}
      </div>
    </article>);

}

function Retail() {
  const cards = [
  { cls: "swat", label: "SWAT", photo: "assets/retail/swat-hot-sauce.jpg", title: "SWAT! Sauces", price: "$7 / bottle", ask: "", variants: [
    { name: "THE O.G. - HABANERO HOT SAUCE", photo: "assets/retail/swat-og.jpg", desc: "Ya mon! Jamaican-ish in style with vibrant habanero, smoky chipotle and warm Caribbean spices." },
    { name: "LA PICA – JALAPEÑO HOT SAUCE", photo: "assets/retail/swat-pica.jpg", desc: "¡Oye! Mexican-ish in style with herbaceous spices, earthly jalapeño & a garlicky zing." },
    { name: "LIL' PRIK – THAI CHILI HOT SAUCE", photo: "assets/retail/swat-prik.jpg", desc: "The sweetest of the bunch. Thai-ish in style kicked up with chilies, tamari & charred onion." }] },
  { cls: "jam", label: "Wham! Jam", photo: "assets/retail/wham-jam.jpg", title: "Wham! Jam", desc: "These three flavors are always in stock: Strawberry Basil, Blackberry Ginger & Mango Tamarindo. Funky fun flavors are offered at the restaurant and bottled in limited quantities.", price: "$8 / jar", ask: "" },
  { cls: "gift", label: "Gift Cards", title: "Gift Cards", desc: "Great gifts available in any denomination.", price: "", ask: "" },
  { cls: "tees", label: "the fly trap", title: "Other Fly Trap Swag", desc: "Sometimes there are T-Shirts, sometimes sweatshirts, maybe pins, maybe patches, come see us to find out!", price: "", ask: "" }];

  return (
    <section id="retail" className="section retail" data-screen-label="Retail">
      <div className="container">
        <div className="section-head center reveal">
          <h2 className="title">Retail</h2>
        </div>
        <div className="retail-grid">
          {cards.map((c) =>
          c.variants ?
          <RetailCarousel key={c.cls} card={c} /> :
          <article key={c.cls} className={"retail-card reveal " + c.cls}>
              <div className="ph">
                {c.photo ?
              <img className="ph-img" src={c.photo} alt={c.title} loading="lazy" /> :
              <span className="ph-label">{c.label}</span>}
              </div>
              <div className="body">
                <h3>{c.title}</h3>
                <p className="desc">{c.desc}</p>
                {c.price || c.ask ?
              <div className="meta-row">
                    {c.price ? <span className="price">{c.price}</span> : null}
                    {c.ask ? <span className="ask">{c.ask}</span> : null}
                  </div> :
              null}
              </div>
            </article>
          )}
        </div>
      </div>
    </section>);

}

// Rotating pull-quote — cycles through FT_DATA.pressQuotes. Pauses on hover/focus
// and respects prefers-reduced-motion (no auto-advance, no motion).
function PressQuote() {
  const quotes = window.FT_DATA.pressQuotes || [];
  const [i, setI] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const reduce = typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  React.useEffect(() => {
    if (reduce || paused || quotes.length < 2) return;
    const id = setInterval(() => setI((n) => (n + 1) % quotes.length), 6000);
    return () => clearInterval(id);
  }, [reduce, paused, quotes.length]);
  if (!quotes.length) return null;
  const q = quotes[i];
  return (
    <div
      className="press-quote reveal"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <p key={i} className="press-pull">{q.quote}</p>
      <p key={"a" + i} className="press-pull-attr">— {q.attr}</p>
      {quotes.length > 1 ? (
        <div className="press-quote-dots" role="tablist" aria-label="Press quotes">
          {quotes.map((_, n) => (
            <button
              key={n}
              type="button"
              className={"press-quote-dot" + (n === i ? " active" : "")}
              aria-label={"Quote " + (n + 1)}
              aria-selected={n === i}
              onClick={() => setI(n)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Press() {
  const items = window.FT_DATA.press;
  return (
    <section id="press" className="section press" data-screen-label="Press">
      <div className="container">
        <div className="section-head reveal">
          <div className="eyebrow">In the news</div>
          <h2 className="title">People keep writing about us.</h2>
        </div>
        <PressQuote />
        <div className="press-list reveal">
          {items.map((it, i) =>
          <a key={i} className="press-item" href={it.url} target="_blank" rel="noopener">
              {it.year ? <span className="year">{it.year}</span> : <span className="year" aria-hidden="true" />}
              <span className="body">
                <span className="outlet">{it.outlet}</span>
                <span className="title">{it.title}</span>
              </span>
              <span className="arrow">↗</span>
            </a>
          )}
        </div>
      </div>
    </section>);

}

function Visit() {
  const today = window.ftTodayIdx();
  const days = [
  { i: 1, label: "Mon" }, { i: 2, label: "Tue" }, { i: 3, label: "Wed" },
  { i: 4, label: "Thu" }, { i: 5, label: "Fri" }, { i: 6, label: "Sat" }, { i: 0, label: "Sun" }];

  // Native maps deep link — universal "maps:" scheme falls back to https on web
  const mapsUrl = "https://maps.google.com/?q=22950+Woodward+Ave,+Ferndale,+MI+48220";

  return (
    <section id="visit" className="section visit" data-screen-label="Visit">
      <div className="container">
        <div className="section-head reveal">
          <div className="eyebrow">Find us</div>
          <h2 className="title">22950 Woodward Ave, Ferndale.</h2>
          <p className="lede">Walk-in only — no reservations. Municipal lot behind the building, plus street parking on Woodward. You can enter from the front or the rear.</p>
        </div>

        <div className="visit-grid">
          <div className="visit-card reveal">
            <h4>Address</h4>
            <a className="visit-addr-link" href={mapsUrl} target="_blank" rel="noopener" aria-label="Open in maps">
              <p className="visit-addr">22950 Woodward Avenue<br />Ferndale, MI 48220</p>
              <span className="addr-cta">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                Open in maps
              </span>
            </a>
            <div className="visit-contact">
              <a href="tel:2483995150">
                <svg className="vc-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                <span className="vc-text">(248) 399-5150</span>
              </a>
              <a href="mailto:dine@theflytrapferndale.com">
                <svg className="vc-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                <span className="vc-text">dine@theflytrapferndale.com</span>
              </a>
              <a href="https://www.instagram.com/theflytrapferndale/" target="_blank" rel="noopener">
                <svg className="vc-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></svg>
                <span className="vc-text">@theflytrapferndale</span>
              </a>
            </div>
          </div>

          <div className="visit-card reveal">
            <h4>Hours</h4>
            <table className="hours">
              <tbody>
                {days.map((d) =>
                <tr key={d.i} className={d.i === today ? "today" : ""}>
                    <td>{d.label}{d.i === today ? " · today" : ""}</td>
                    <td>8:00a — 3:00p</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>);

}

function Footer({ onNavigate }) {
  return (
    <footer>
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <img src="assets/brand/flytrap-logo-original-red.png" alt="The Fly Trap — a finer diner" />
            <span className="tag">Catch a Buzz.</span>
            <p className="footer-addr">22950 Woodward Ave, Ferndale, MI 48220.</p>
            <p className="footer-motto">Walk in, sit down, eat magnificently.</p>
          </div>
          <div className="footer-col">
            <h6>Eat</h6>
            <ul>
              <li><a href="#menu" onClick={(e) => {e.preventDefault();onNavigate("#menu");}}>Menu</a></li>
              <li><a href="#retail" onClick={(e) => {e.preventDefault();onNavigate("#retail");}}>Retail</a></li>
            </ul>
          </div>
          <div className="footer-col">
            <h6>Know</h6>
            <ul>
              <li><a href="#about" onClick={(e) => {e.preventDefault();onNavigate("#about");}}>About</a></li>
              <li><a href="#press" onClick={(e) => {e.preventDefault();onNavigate("#press");}}>Press</a></li>
              <li><a href="#visit" onClick={(e) => {e.preventDefault();onNavigate("#visit");}}>Contact</a></li>
            </ul>
          </div>
          <div className="footer-col">
            <h6>Follow</h6>
            <ul>
              <li><a href="https://www.instagram.com/theflytrapferndale/" target="_blank" rel="noopener">Instagram</a></li>
              <li><a href="tel:2483995150">(248) 399-5150</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 The Fly Trap · Buzzin' since 2004 · Ferndale, MI</span>
          <span className="footer-credit">
            Designed and developed by{" "}
            <a href="https://summitsoftwaresolutions.dev" target="_blank" rel="noopener">Ryan Kolean</a>
          </span>
        </div>
      </div>
    </footer>);

}

window.About = About;
window.Retail = Retail;
window.Press = Press;
window.Visit = Visit;
window.Footer = Footer;
