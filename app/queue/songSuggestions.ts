export interface SongSuggestion {
  /** Romanized title — kept for analytics and Latin-script contexts. */
  title: string;
  /** Romanized artist — kept for analytics and Latin-script contexts. */
  artist: string;
  /** Native-script title (한글 / kanji-kana / देवनागरी) when the song isn't Latin-script natively. */
  nativeTitle?: string;
  /** Native-script artist name. */
  nativeArtist?: string;
}

export interface SongCategory {
  id: string;
  name: string;
  emoji: string;
  songs: SongSuggestion[];
}

export interface SongSection {
  id: string;
  label: string;
  categories: SongCategory[];
}

export const SONG_SECTIONS: SongSection[] = [
  // ───────────────────────────────────────────
  // GENRE
  // ───────────────────────────────────────────
  {
    id: 'genre',
    label: 'Genre',
    categories: [
      {
        id: 'crowd-pleasers',
        name: 'Crowd Pleasers',
        emoji: '🔥',
        songs: [
          { title: "Don't Stop Believin'", artist: 'Journey' },
          { title: 'Bohemian Rhapsody', artist: 'Queen' },
          { title: 'Mr. Brightside', artist: 'The Killers' },
          { title: 'Sweet Caroline', artist: 'Neil Diamond' },
          { title: "Livin' on a Prayer", artist: 'Bon Jovi' },
          { title: 'Take Me Home, Country Roads', artist: 'John Denver' },
          { title: 'Dancing Queen', artist: 'ABBA' },
          { title: 'September', artist: 'Earth, Wind & Fire' },
          { title: 'Wonderwall', artist: 'Oasis' },
          { title: 'Hey Jude', artist: 'The Beatles' },
          { title: "Ain't No Mountain High Enough", artist: 'Marvin Gaye' },
          { title: 'Build Me Up Buttercup', artist: 'The Foundations' },
          { title: 'Come On Eileen', artist: 'Dexys Midnight Runners' },
          { title: 'Africa', artist: 'Toto' },
          { title: 'Tiny Dancer', artist: 'Elton John' },
          { title: 'Piano Man', artist: 'Billy Joel' },
          { title: 'Twist and Shout', artist: 'The Beatles' },
          { title: 'I Gotta Feeling', artist: 'Black Eyed Peas' },
          { title: 'Shout', artist: 'The Isley Brothers' },
          { title: 'You Make My Dreams', artist: 'Hall & Oates' },
          { title: 'Walking on Sunshine', artist: 'Katrina and the Waves' },
          { title: 'Lean on Me', artist: 'Bill Withers' },
          { title: 'Everybody (Backstreet\'s Back)', artist: 'Backstreet Boys' },
          { title: 'Mamma Mia', artist: 'ABBA' },
          { title: 'Crocodile Rock', artist: 'Elton John' },
        ],
      },
      {
        id: 'power-ballads',
        name: 'Power Ballads',
        emoji: '🎤',
        songs: [
          { title: 'I Will Always Love You', artist: 'Whitney Houston' },
          { title: 'Total Eclipse of the Heart', artist: 'Bonnie Tyler' },
          { title: 'My Heart Will Go On', artist: 'Celine Dion' },
          { title: "It's All Coming Back to Me Now", artist: 'Celine Dion' },
          { title: 'I Want to Know What Love Is', artist: 'Foreigner' },
          { title: 'Without You', artist: 'Mariah Carey' },
          { title: 'All By Myself', artist: 'Celine Dion' },
          { title: 'Nothing Compares 2 U', artist: "Sinead O'Connor" },
          { title: 'The Power of Love', artist: 'Celine Dion' },
          { title: 'Un-Break My Heart', artist: 'Toni Braxton' },
          { title: 'Vision of Love', artist: 'Mariah Carey' },
          { title: 'Alone', artist: 'Heart' },
          { title: "I Don't Want to Miss a Thing", artist: 'Aerosmith' },
          { title: 'Faithfully', artist: 'Journey' },
          { title: 'Open Arms', artist: 'Journey' },
          { title: 'Every Breath You Take', artist: 'The Police' },
          { title: 'Right Here Waiting', artist: 'Richard Marx' },
          { title: 'Hello', artist: 'Adele' },
          { title: 'Someone Like You', artist: 'Adele' },
          { title: 'Against All Odds', artist: 'Phil Collins' },
          { title: 'Eternal Flame', artist: 'The Bangles' },
          { title: 'When I Was Your Man', artist: 'Bruno Mars' },
        ],
      },
      {
        id: 'throwbacks',
        name: '90s & 2000s',
        emoji: '💿',
        songs: [
          { title: 'Wannabe', artist: 'Spice Girls' },
          { title: 'No Scrubs', artist: 'TLC' },
          { title: 'Bye Bye Bye', artist: '*NSYNC' },
          { title: '...Baby One More Time', artist: 'Britney Spears' },
          { title: 'Since U Been Gone', artist: 'Kelly Clarkson' },
          { title: 'Yeah!', artist: 'Usher' },
          { title: 'Toxic', artist: 'Britney Spears' },
          { title: 'Ms. Jackson', artist: 'OutKast' },
          { title: 'Genie in a Bottle', artist: 'Christina Aguilera' },
          { title: 'I Want It That Way', artist: 'Backstreet Boys' },
          { title: 'MMMBop', artist: 'Hanson' },
          { title: 'Waterfalls', artist: 'TLC' },
          { title: 'Teenage Dream', artist: 'Katy Perry' },
          { title: 'Crazy in Love', artist: 'Beyonce' },
          { title: 'Hot in Herre', artist: 'Nelly' },
          { title: 'Ignition (Remix)', artist: 'R. Kelly' },
          { title: 'Get the Party Started', artist: 'P!nk' },
          { title: "It Wasn't Me", artist: 'Shaggy' },
          { title: 'Believe', artist: 'Cher' },
          { title: 'Say My Name', artist: "Destiny's Child" },
          { title: 'Iris', artist: 'Goo Goo Dolls' },
          { title: 'Semi-Charmed Life', artist: 'Third Eye Blind' },
          { title: 'Larger Than Life', artist: 'Backstreet Boys' },
          { title: 'All Star', artist: 'Smash Mouth' },
        ],
      },
      {
        id: 'pop-anthems',
        name: 'Pop Anthems',
        emoji: '💃',
        songs: [
          { title: 'Shake It Off', artist: 'Taylor Swift' },
          { title: 'Uptown Funk', artist: 'Bruno Mars' },
          { title: 'Rolling in the Deep', artist: 'Adele' },
          { title: 'Happy', artist: 'Pharrell Williams' },
          { title: 'Levitating', artist: 'Dua Lipa' },
          { title: 'Espresso', artist: 'Sabrina Carpenter' },
          { title: 'Flowers', artist: 'Miley Cyrus' },
          { title: 'good 4 u', artist: 'Olivia Rodrigo' },
          { title: 'Blank Space', artist: 'Taylor Swift' },
          { title: "Can't Stop the Feeling!", artist: 'Justin Timberlake' },
          { title: 'Shut Up and Dance', artist: 'Walk the Moon' },
          { title: 'Roar', artist: 'Katy Perry' },
          { title: 'Dynamite', artist: 'BTS' },
          { title: 'Blinding Lights', artist: 'The Weeknd' },
          { title: 'Love Story', artist: 'Taylor Swift' },
          { title: 'Bad Guy', artist: 'Billie Eilish' },
          { title: 'Watermelon Sugar', artist: 'Harry Styles' },
          { title: 'As It Was', artist: 'Harry Styles' },
          { title: 'drivers license', artist: 'Olivia Rodrigo' },
          { title: 'Anti-Hero', artist: 'Taylor Swift' },
          { title: 'Shivers', artist: 'Ed Sheeran' },
          { title: 'Shape of You', artist: 'Ed Sheeran' },
          { title: 'Thinking Out Loud', artist: 'Ed Sheeran' },
          { title: 'Stay', artist: 'The Kid LAROI & Justin Bieber' },
        ],
      },
      {
        id: 'rock-classics',
        name: 'Rock Classics',
        emoji: '🎸',
        songs: [
          { title: 'We Will Rock You', artist: 'Queen' },
          { title: 'You Shook Me All Night Long', artist: 'AC/DC' },
          { title: 'Pour Some Sugar on Me', artist: 'Def Leppard' },
          { title: 'Eye of the Tiger', artist: 'Survivor' },
          { title: "Summer of '69", artist: 'Bryan Adams' },
          { title: 'Here I Go Again', artist: 'Whitesnake' },
          { title: 'Hotel California', artist: 'Eagles' },
          { title: 'Born to Run', artist: 'Bruce Springsteen' },
          { title: "Jessie's Girl", artist: 'Rick Springfield' },
          { title: "Sweet Child O' Mine", artist: "Guns N' Roses" },
          { title: 'Wanted Dead or Alive', artist: 'Bon Jovi' },
          { title: 'We Are the Champions', artist: 'Queen' },
          { title: 'Dream On', artist: 'Aerosmith' },
          { title: 'Somebody to Love', artist: 'Queen' },
          { title: 'Stairway to Heaven', artist: 'Led Zeppelin' },
          { title: 'Free Bird', artist: 'Lynyrd Skynyrd' },
          { title: 'More Than a Feeling', artist: 'Boston' },
          { title: 'Carry On Wayward Son', artist: 'Kansas' },
          { title: 'Back in Black', artist: 'AC/DC' },
          { title: 'Thunderstruck', artist: 'AC/DC' },
          { title: 'Crazy Train', artist: 'Ozzy Osbourne' },
          { title: 'Paradise City', artist: "Guns N' Roses" },
        ],
      },
      {
        id: 'rnb-soul',
        name: 'R&B / Soul',
        emoji: '🎵',
        songs: [
          { title: 'Respect', artist: 'Aretha Franklin' },
          { title: 'Superstition', artist: 'Stevie Wonder' },
          { title: "Fallin'", artist: 'Alicia Keys' },
          { title: "If I Ain't Got You", artist: 'Alicia Keys' },
          { title: 'Drunk in Love', artist: 'Beyonce' },
          { title: 'I Gotta Feeling', artist: 'Black Eyed Peas' },
          { title: 'No Diggity', artist: 'Blackstreet' },
          { title: "Let's Stay Together", artist: 'Al Green' },
          { title: 'Kiss', artist: 'Prince' },
          { title: "Signed, Sealed, Delivered (I'm Yours)", artist: 'Stevie Wonder' },
          { title: 'End of the Road', artist: 'Boyz II Men' },
          { title: 'Golden', artist: 'Jill Scott' },
          { title: 'Best Part', artist: 'Daniel Caesar & H.E.R.' },
          { title: "I'll Make Love to You", artist: 'Boyz II Men' },
          { title: 'My Girl', artist: 'The Temptations' },
          { title: "Ain't No Sunshine", artist: 'Bill Withers' },
          { title: "You've Got a Friend", artist: 'Carole King' },
          { title: 'Killing Me Softly', artist: 'Fugees' },
          { title: 'Halo', artist: 'Beyonce' },
          { title: 'Love on Top', artist: 'Beyonce' },
          { title: 'Irreplaceable', artist: 'Beyonce' },
          { title: 'A Change Is Gonna Come', artist: 'Sam Cooke' },
        ],
      },
      {
        id: 'disney-musical',
        name: 'Disney & Musicals',
        emoji: '✨',
        songs: [
          { title: 'Let It Go', artist: 'Frozen' },
          { title: 'A Whole New World', artist: 'Aladdin' },
          { title: 'Part of Your World', artist: 'The Little Mermaid' },
          { title: 'Defying Gravity', artist: 'Wicked' },
          { title: "Don't Rain on My Parade", artist: 'Funny Girl' },
          { title: "We Don't Talk About Bruno", artist: 'Encanto' },
          { title: 'Surface Pressure', artist: 'Encanto' },
          { title: 'Under the Sea', artist: 'The Little Mermaid' },
          { title: 'Circle of Life', artist: 'The Lion King' },
          { title: "How Far I'll Go", artist: 'Moana' },
          { title: 'Popular', artist: 'Wicked' },
          { title: 'Beauty and the Beast', artist: 'Beauty and the Beast' },
          { title: 'Memory', artist: 'Cats' },
          { title: 'And I Am Telling You', artist: 'Dreamgirls' },
          { title: 'Can You Feel the Love Tonight', artist: 'The Lion King' },
          { title: 'Be Our Guest', artist: 'Beauty and the Beast' },
          { title: 'I Dreamed a Dream', artist: 'Les Miserables' },
          { title: 'On My Own', artist: 'Les Miserables' },
          { title: 'Seasons of Love', artist: 'Rent' },
          { title: 'Do You Hear the People Sing', artist: 'Les Miserables' },
          { title: 'One Day More', artist: 'Les Miserables' },
          { title: 'Tonight', artist: 'West Side Story' },
          { title: 'Somewhere Over the Rainbow', artist: 'The Wizard of Oz' },
          { title: 'Into the Unknown', artist: 'Frozen 2' },
        ],
      },
      {
        id: 'country',
        name: 'Country',
        emoji: '🤠',
        songs: [
          { title: 'Friends in Low Places', artist: 'Garth Brooks' },
          { title: 'Man! I Feel Like a Woman!', artist: 'Shania Twain' },
          { title: 'Before He Cheats', artist: 'Carrie Underwood' },
          { title: 'Jolene', artist: 'Dolly Parton' },
          { title: 'Cruise', artist: 'Florida Georgia Line' },
          { title: 'Need You Now', artist: 'Lady A' },
          { title: '9 to 5', artist: 'Dolly Parton' },
          { title: 'Ring of Fire', artist: 'Johnny Cash' },
          { title: 'Strawberry Wine', artist: 'Deana Carter' },
          { title: "Boot Scootin' Boogie", artist: 'Brooks & Dunn' },
          { title: 'Fancy Like', artist: 'Walker Hayes' },
          { title: 'The Dance', artist: 'Garth Brooks' },
          { title: 'Wagon Wheel', artist: 'Darius Rucker' },
          { title: 'Chattahoochee', artist: 'Alan Jackson' },
          { title: 'Achy Breaky Heart', artist: 'Billy Ray Cyrus' },
          { title: 'She Thinks My Tractor\'s Sexy', artist: 'Kenny Chesney' },
          { title: 'Folsom Prison Blues', artist: 'Johnny Cash' },
          { title: 'Islands in the Stream', artist: 'Dolly Parton & Kenny Rogers' },
          { title: 'Tennessee Whiskey', artist: 'Chris Stapleton' },
          { title: 'Die a Happy Man', artist: 'Thomas Rhett' },
          { title: 'Drunk on a Plane', artist: 'Dierks Bentley' },
          { title: 'Any Man of Mine', artist: 'Shania Twain' },
        ],
      },
      {
        id: 'duets',
        name: 'Duets',
        emoji: '👯',
        songs: [
          { title: 'I Got You Babe', artist: 'Sonny & Cher' },
          { title: "Don't Go Breaking My Heart", artist: 'Elton John & Kiki Dee' },
          { title: 'Shallow', artist: 'Lady Gaga & Bradley Cooper' },
          { title: 'Summer Nights', artist: 'Grease' },
          { title: 'Somebody That I Used to Know', artist: 'Gotye' },
          { title: 'Under Pressure', artist: 'Queen & David Bowie' },
          { title: "Nothin' on You", artist: 'B.o.B & Bruno Mars' },
          { title: 'Endless Love', artist: 'Diana Ross & Lionel Richie' },
          { title: 'A Whole New World', artist: 'Aladdin' },
          { title: "You're the One That I Want", artist: 'Grease' },
          { title: 'Islands in the Stream', artist: 'Dolly Parton & Kenny Rogers' },
          { title: "Ain't No Mountain High Enough", artist: 'Marvin Gaye & Tammi Terrell' },
          { title: 'The Time of My Life', artist: 'Dirty Dancing' },
          { title: 'Empire State of Mind', artist: 'Jay-Z & Alicia Keys' },
          { title: 'No Air', artist: 'Jordin Sparks & Chris Brown' },
          { title: 'Lucky', artist: 'Jason Mraz & Colbie Caillat' },
          { title: 'Promiscuous', artist: 'Nelly Furtado & Timbaland' },
          { title: 'The Boy Is Mine', artist: 'Brandy & Monica' },
          { title: 'Cruisin\'', artist: 'Smokey Robinson' },
          { title: 'Unforgettable', artist: 'Nat King Cole & Natalie Cole' },
        ],
      },
      {
        id: 'hip-hop',
        name: 'Hip-Hop & Rap',
        emoji: '🎧',
        songs: [
          { title: 'Lose Yourself', artist: 'Eminem' },
          { title: 'Gold Digger', artist: 'Kanye West' },
          { title: 'In Da Club', artist: '50 Cent' },
          { title: 'Jump Around', artist: 'House of Pain' },
          { title: 'California Love', artist: '2Pac' },
          { title: 'Juicy', artist: 'The Notorious B.I.G.' },
          { title: "Rapper's Delight", artist: 'Sugarhill Gang' },
          { title: 'Hey Ya!', artist: 'OutKast' },
          { title: 'Sicko Mode', artist: 'Travis Scott' },
          { title: 'HUMBLE.', artist: 'Kendrick Lamar' },
          { title: 'Hotline Bling', artist: 'Drake' },
          { title: 'Gin and Juice', artist: 'Snoop Dogg' },
          { title: 'Hypnotize', artist: 'The Notorious B.I.G.' },
          { title: 'Nuthin\' but a "G" Thang', artist: 'Dr. Dre' },
          { title: 'U Can\'t Touch This', artist: 'MC Hammer' },
          { title: 'It Was a Good Day', artist: 'Ice Cube' },
          { title: 'Alright', artist: 'Kendrick Lamar' },
          { title: 'Bodak Yellow', artist: 'Cardi B' },
          { title: "Mo' Money Mo' Problems", artist: 'The Notorious B.I.G.' },
          { title: 'FEIN', artist: 'Travis Scott' },
        ],
      },
    ],
  },

  // ───────────────────────────────────────────
  // VOICE TYPE
  // ───────────────────────────────────────────
  {
    id: 'voice-type',
    label: 'Voice Type',
    categories: [
      {
        id: 'low-voice',
        name: 'Low & Deep',
        emoji: '🫧',
        songs: [
          { title: 'Ring of Fire', artist: 'Johnny Cash' },
          { title: 'Feeling Good', artist: 'Michael Buble' },
          { title: "Can't Help Falling in Love", artist: 'Elvis Presley' },
          { title: 'Fly Me to the Moon', artist: 'Frank Sinatra' },
          { title: 'Stand by Me', artist: 'Ben E. King' },
          { title: 'Unchained Melody', artist: 'Righteous Brothers' },
          { title: 'The House of the Rising Sun', artist: 'The Animals' },
          { title: 'Folsom Prison Blues', artist: 'Johnny Cash' },
          { title: 'Georgia on My Mind', artist: 'Ray Charles' },
          { title: 'Under the Bridge', artist: 'Red Hot Chili Peppers' },
          { title: 'Hallelujah', artist: 'Leonard Cohen' },
          { title: 'The Gambler', artist: 'Kenny Rogers' },
          { title: 'My Way', artist: 'Frank Sinatra' },
          { title: 'Hurt', artist: 'Johnny Cash' },
          { title: "I Walk the Line", artist: 'Johnny Cash' },
          { title: 'Suspicious Minds', artist: 'Elvis Presley' },
          { title: 'The Way You Look Tonight', artist: 'Frank Sinatra' },
          { title: 'Blue Suede Shoes', artist: 'Elvis Presley' },
          { title: "Let's Get It On", artist: 'Marvin Gaye' },
          { title: 'Wonderful Tonight', artist: 'Eric Clapton' },
        ],
      },
      {
        id: 'mid-voice',
        name: 'Mid Range',
        emoji: '🎶',
        songs: [
          { title: 'Sweet Caroline', artist: 'Neil Diamond' },
          { title: 'Mr. Brightside', artist: 'The Killers' },
          { title: 'Take Me Home, Country Roads', artist: 'John Denver' },
          { title: 'Hey Jude', artist: 'The Beatles' },
          { title: "Don't Stop Believin'", artist: 'Journey' },
          { title: 'Hotel California', artist: 'Eagles' },
          { title: 'Wonderwall', artist: 'Oasis' },
          { title: 'Piano Man', artist: 'Billy Joel' },
          { title: 'Brown Eyed Girl', artist: 'Van Morrison' },
          { title: 'Come On Eileen', artist: 'Dexys Midnight Runners' },
          { title: 'Africa', artist: 'Toto' },
          { title: 'Wagon Wheel', artist: 'Darius Rucker' },
          { title: 'Valerie', artist: 'Amy Winehouse' },
          { title: 'Just the Way You Are', artist: 'Bruno Mars' },
          { title: 'Riptide', artist: 'Vance Joy' },
          { title: 'Budapest', artist: 'George Ezra' },
          { title: 'Hey There Delilah', artist: 'Plain White T\'s' },
          { title: 'I\'m Yours', artist: 'Jason Mraz' },
          { title: 'Use Somebody', artist: 'Kings of Leon' },
          { title: 'Chasing Cars', artist: 'Snow Patrol' },
        ],
      },
      {
        id: 'high-voice',
        name: 'High & Powerful',
        emoji: '🌟',
        songs: [
          { title: 'I Will Always Love You', artist: 'Whitney Houston' },
          { title: 'And I Am Telling You', artist: 'Dreamgirls' },
          { title: 'Defying Gravity', artist: 'Wicked' },
          { title: 'Rolling in the Deep', artist: 'Adele' },
          { title: 'My Heart Will Go On', artist: 'Celine Dion' },
          { title: 'Total Eclipse of the Heart', artist: 'Bonnie Tyler' },
          { title: "It's All Coming Back to Me Now", artist: 'Celine Dion' },
          { title: 'Listen', artist: 'Beyonce' },
          { title: 'Chandelier', artist: 'Sia' },
          { title: 'Vision of Love', artist: 'Mariah Carey' },
          { title: "Lovin' You", artist: 'Minnie Riperton' },
          { title: 'Without You', artist: 'Mariah Carey' },
          { title: 'Emotions', artist: 'Mariah Carey' },
          { title: 'Rise Up', artist: 'Andra Day' },
          { title: 'Love on Top', artist: 'Beyonce' },
          { title: 'Natural Woman', artist: 'Aretha Franklin' },
          { title: 'I Have Nothing', artist: 'Whitney Houston' },
          { title: 'Run to You', artist: 'Whitney Houston' },
          { title: 'Titanium', artist: 'Sia' },
          { title: 'Stone Cold', artist: 'Demi Lovato' },
        ],
      },
      {
        id: 'easy-sing',
        name: 'Easy to Sing',
        emoji: '😌',
        songs: [
          { title: 'No Rain', artist: 'Blind Melon' },
          { title: "You're So Vain", artist: 'Carly Simon' },
          { title: 'Love Shack', artist: "The B-52's" },
          { title: 'Three Little Birds', artist: 'Bob Marley' },
          { title: "Ain't No Sunshine", artist: 'Bill Withers' },
          { title: 'Lean on Me', artist: 'Bill Withers' },
          { title: 'Girls Just Want to Have Fun', artist: 'Cyndi Lauper' },
          { title: 'Jolene', artist: 'Dolly Parton' },
          { title: 'Riptide', artist: 'Vance Joy' },
          { title: 'Hey Ya!', artist: 'OutKast' },
          { title: 'Walking on Sunshine', artist: 'Katrina and the Waves' },
          { title: 'Take Me Home, Country Roads', artist: 'John Denver' },
          { title: 'Sweet Home Alabama', artist: 'Lynyrd Skynyrd' },
          { title: 'Let It Be', artist: 'The Beatles' },
          { title: 'Stand by Me', artist: 'Ben E. King' },
          { title: 'Brown Eyed Girl', artist: 'Van Morrison' },
          { title: 'Margaritaville', artist: 'Jimmy Buffett' },
          { title: 'Free Fallin\'', artist: 'Tom Petty' },
          { title: 'Knockin\' on Heaven\'s Door', artist: 'Bob Dylan' },
          { title: 'Horse with No Name', artist: 'America' },
        ],
      },
    ],
  },

  // ───────────────────────────────────────────
  // SPANISH
  // ───────────────────────────────────────────
  {
    id: 'spanish',
    label: '🇲🇽 En Espanol',
    categories: [
      {
        id: 'es-reggaeton',
        name: 'Reggaeton & Perreo',
        emoji: '🔥',
        songs: [
          { title: 'Gasolina', artist: 'Daddy Yankee' },
          { title: 'Despacito', artist: 'Luis Fonsi' },
          { title: 'Danza Kuduro', artist: 'Don Omar' },
          { title: 'Suavemente', artist: 'Elvis Crespo' },
          { title: 'La Tortura', artist: 'Shakira' },
          { title: 'Bailando', artist: 'Enrique Iglesias' },
          { title: 'Ella Baila Sola', artist: 'Eslabon Armado & Peso Pluma' },
          { title: 'Te Felicito', artist: 'Shakira & Rauw Alejandro' },
          { title: 'Tusa', artist: 'Karol G & Nicki Minaj' },
          { title: 'Con Calma', artist: 'Daddy Yankee' },
          { title: 'Safaera', artist: 'Bad Bunny' },
          { title: 'Dile', artist: 'Don Omar' },
          { title: 'Pobre Diabla', artist: 'Don Omar' },
          { title: 'Mayor Que Usted', artist: 'Nicky Jam, Daddy Yankee & Plan B' },
          { title: 'Lo Que Paso Paso', artist: 'Daddy Yankee' },
          { title: 'Rakata', artist: 'Wisin & Yandel' },
          { title: 'Oye Mi Canto', artist: 'N.O.R.E.' },
          { title: 'Yo Perreo Sola', artist: 'Bad Bunny' },
          { title: 'Dakiti', artist: 'Bad Bunny & Jhay Cortez' },
          { title: 'Rompe', artist: 'Daddy Yankee' },
        ],
      },
      {
        id: 'es-regional',
        name: 'Regional Mexicano',
        emoji: '🇲🇽',
        songs: [
          { title: 'El Rey', artist: 'Vicente Fernandez' },
          { title: 'Cielito Lindo', artist: 'Traditional' },
          { title: 'Como la Flor', artist: 'Selena' },
          { title: 'Amor Prohibido', artist: 'Selena' },
          { title: 'Bidi Bidi Bom Bom', artist: 'Selena' },
          { title: 'El Son de la Negra', artist: 'Traditional' },
          { title: 'Volver Volver', artist: 'Vicente Fernandez' },
          { title: 'La Bikina', artist: 'Luis Miguel' },
          { title: 'Mexico Lindo y Querido', artist: 'Jorge Negrete' },
          { title: 'Si Nos Dejan', artist: 'Luis Miguel' },
          { title: 'Por Tu Maldito Amor', artist: 'Vicente Fernandez' },
          { title: 'Amor Eterno', artist: 'Juan Gabriel' },
          { title: 'Querida', artist: 'Juan Gabriel' },
          { title: 'De Que Manera Te Olvido', artist: 'Vicente Fernandez' },
          { title: 'Ya Lo Se Que Tu Te Vas', artist: 'Juan Gabriel' },
          { title: 'Hasta Que Te Conoci', artist: 'Juan Gabriel' },
          { title: 'Un Puño de Tierra', artist: 'Antonio Aguilar' },
          { title: 'La de la Mochila Azul', artist: 'Pedrito Fernandez' },
          { title: 'Tu Con El', artist: 'Frank Reyes' },
          { title: 'Estos Celos', artist: 'Vicente Fernandez' },
        ],
      },
      {
        id: 'es-pop',
        name: 'Pop en Espanol',
        emoji: '💃',
        songs: [
          { title: "Livin' La Vida Loca", artist: 'Ricky Martin' },
          { title: "Hips Don't Lie", artist: 'Shakira' },
          { title: 'Me Enamora', artist: 'Juanes' },
          { title: 'Ojitos Lindos', artist: 'Bad Bunny & Bomba Estereo' },
          { title: 'Vivir Mi Vida', artist: 'Marc Anthony' },
          { title: 'La Camisa Negra', artist: 'Juanes' },
          { title: 'Waka Waka', artist: 'Shakira' },
          { title: 'Eres Tu', artist: 'Mocedades' },
          { title: 'Loco', artist: 'Enrique Iglesias' },
          { title: 'Corazon Espinado', artist: 'Santana & Mana' },
          { title: 'Rayando el Sol', artist: 'Mana' },
          { title: 'Mariposa Traicionera', artist: 'Mana' },
          { title: 'Labios Compartidos', artist: 'Mana' },
          { title: 'Suerte', artist: 'Shakira' },
          { title: 'Loba', artist: 'Shakira' },
          { title: 'La Bicicleta', artist: 'Shakira & Carlos Vives' },
          { title: 'Chantaje', artist: 'Shakira & Maluma' },
          { title: 'Bonito', artist: 'Jarabe de Palo' },
          { title: 'Flaca', artist: 'Andres Calamaro' },
          { title: 'De Musica Ligera', artist: 'Soda Stereo' },
        ],
      },
      {
        id: 'es-baladas',
        name: 'Baladas',
        emoji: '💔',
        songs: [
          { title: 'Besame Mucho', artist: 'Consuelo Velazquez' },
          { title: 'La Bamba', artist: 'Ritchie Valens' },
          { title: 'Cuando Me Enamoro', artist: 'Enrique Iglesias' },
          { title: 'Hero', artist: 'Enrique Iglesias' },
          { title: 'Que Te Pido', artist: 'Aventura' },
          { title: 'Obsesion', artist: 'Aventura' },
          { title: 'Burbujas de Amor', artist: 'Juan Luis Guerra' },
          { title: 'Enrique', artist: 'Enrique Iglesias' },
          { title: 'Si Tu Te Vas', artist: 'Enrique Iglesias' },
          { title: 'Eres', artist: 'Cafe Tacuba' },
          { title: 'Te Quiero', artist: 'Hombres G' },
          { title: 'Como Te Voy a Olvidar', artist: 'Los Angeles Azules' },
          { title: 'La Incondicional', artist: 'Luis Miguel' },
          { title: 'Ahora Te Puedes Marchar', artist: 'Luis Miguel' },
          { title: 'Devuelveme El Corazon', artist: 'Sebastian Yatra' },
          { title: 'Te Robare', artist: 'Nicky Jam & Ozuna' },
          { title: 'Un Velero Llamado Libertad', artist: 'Jose Luis Perales' },
          { title: 'Sabor a Mi', artist: 'Luis Miguel' },
          { title: 'Somos Novios', artist: 'Armando Manzanero' },
          { title: 'Contigo Aprendi', artist: 'Luis Miguel' },
        ],
      },
      {
        id: 'es-salsa-cumbia',
        name: 'Salsa & Cumbia',
        emoji: '🪇',
        songs: [
          { title: 'Quimbara', artist: 'Celia Cruz' },
          { title: 'La Vida Es un Carnaval', artist: 'Celia Cruz' },
          { title: 'Pedro Navaja', artist: 'Ruben Blades' },
          { title: 'Aguanile', artist: 'Hector Lavoe' },
          { title: 'El Cantante', artist: 'Hector Lavoe' },
          { title: 'Quiero Ser Tu Amigo', artist: 'Ruben Blades' },
          { title: 'El Gran Varon', artist: 'Willie Colon' },
          { title: 'Tu Con El', artist: 'Frankie Ruiz' },
          { title: 'La Cura', artist: 'Frankie Ruiz' },
          { title: 'Oye Como Va', artist: 'Tito Puente' },
          { title: 'La Pollera Colora', artist: 'Traditional' },
          { title: 'Cumbia del Sol', artist: 'Los Mirlos' },
          { title: 'La Piragua', artist: 'Jose Barros' },
          { title: 'Yo No Soy Esa Mujer', artist: 'Paulina Rubio' },
          { title: 'Azucar', artist: 'Celia Cruz' },
          { title: 'Idilio', artist: 'Willie Colon' },
          { title: 'Todavia Me Amas', artist: 'Aventura' },
          { title: 'El Preso', artist: 'Fruko y sus Tesos' },
          { title: 'Cali Pachanguero', artist: 'Grupo Niche' },
          { title: 'Rebelion', artist: 'Joe Arroyo' },
        ],
      },
    ],
  },

  // ───────────────────────────────────────────
  // K-POP
  // ───────────────────────────────────────────
  {
    id: 'kpop',
    label: '🇰🇷 K-Pop',
    categories: [
      {
        id: 'kpop-boy-groups',
        name: 'Boy Groups',
        emoji: '🕺',
        songs: [
          { title: 'Dynamite', artist: 'BTS', nativeArtist: '방탄소년단' },
          { title: 'Butter', artist: 'BTS', nativeArtist: '방탄소년단' },
          { title: 'Boy With Luv', artist: 'BTS', nativeTitle: '작은 것들을 위한 시', nativeArtist: '방탄소년단' },
          { title: 'Spring Day', artist: 'BTS', nativeTitle: '봄날', nativeArtist: '방탄소년단' },
          { title: 'Fake Love', artist: 'BTS', nativeArtist: '방탄소년단' },
          { title: 'DNA', artist: 'BTS', nativeArtist: '방탄소년단' },
          { title: 'IDOL', artist: 'BTS', nativeArtist: '방탄소년단' },
          { title: 'Fire', artist: 'BTS', nativeTitle: '불타오르네', nativeArtist: '방탄소년단' },
          { title: 'God\'s Menu', artist: 'Stray Kids', nativeTitle: '神메뉴', nativeArtist: '스트레이 키즈' },
          { title: 'LALALALA', artist: 'Stray Kids', nativeTitle: '락 (樂)', nativeArtist: '스트레이 키즈' },
          { title: 'Love Dive', artist: 'IVE', nativeArtist: '아이브' },
          { title: 'Growl', artist: 'EXO', nativeTitle: '으르렁', nativeArtist: '엑소' },
          { title: 'Love Shot', artist: 'EXO', nativeArtist: '엑소' },
          { title: 'Ring Ding Dong', artist: 'SHINee', nativeTitle: '링딩동', nativeArtist: '샤이니' },
          { title: 'Replay', artist: 'SHINee', nativeTitle: '누난 너무 예뻐 (Replay)', nativeArtist: '샤이니' },
          { title: 'Sorry Sorry', artist: 'Super Junior', nativeTitle: '쏘리 쏘리', nativeArtist: '슈퍼주니어' },
          { title: 'Fantastic Baby', artist: 'BIGBANG', nativeArtist: '빅뱅' },
          { title: 'Bang Bang Bang', artist: 'BIGBANG', nativeTitle: '뱅뱅뱅', nativeArtist: '빅뱅' },
          { title: 'FEVER', artist: 'ENHYPEN', nativeArtist: '엔하이픈' },
          { title: 'Bite Me', artist: 'ENHYPEN', nativeArtist: '엔하이픈' },
        ],
      },
      {
        id: 'kpop-girl-groups',
        name: 'Girl Groups',
        emoji: '💅',
        songs: [
          { title: 'How You Like That', artist: 'BLACKPINK', nativeArtist: '블랙핑크' },
          { title: 'DDU-DU DDU-DU', artist: 'BLACKPINK', nativeTitle: '뚜두뚜두', nativeArtist: '블랙핑크' },
          { title: 'Kill This Love', artist: 'BLACKPINK', nativeArtist: '블랙핑크' },
          { title: 'Pink Venom', artist: 'BLACKPINK', nativeArtist: '블랙핑크' },
          { title: 'Lovesick Girls', artist: 'BLACKPINK', nativeArtist: '블랙핑크' },
          { title: 'Super Shy', artist: 'NewJeans', nativeArtist: '뉴진스' },
          { title: 'Hype Boy', artist: 'NewJeans', nativeArtist: '뉴진스' },
          { title: 'Attention', artist: 'NewJeans', nativeArtist: '뉴진스' },
          { title: 'TT', artist: 'TWICE', nativeArtist: '트와이스' },
          { title: 'Cheer Up', artist: 'TWICE', nativeArtist: '트와이스' },
          { title: 'What Is Love?', artist: 'TWICE', nativeArtist: '트와이스' },
          { title: 'Feel My Rhythm', artist: 'Red Velvet', nativeArtist: '레드벨벳' },
          { title: 'Psycho', artist: 'Red Velvet', nativeArtist: '레드벨벳' },
          { title: 'Next Level', artist: 'aespa', nativeArtist: '에스파' },
          { title: 'Savage', artist: 'aespa', nativeArtist: '에스파' },
          { title: 'Queencard', artist: '(G)I-DLE', nativeTitle: '퀸카 (Queencard)', nativeArtist: '(여자)아이들' },
          { title: 'TOMBOY', artist: '(G)I-DLE', nativeArtist: '(여자)아이들' },
          { title: 'Gee', artist: "Girls' Generation", nativeArtist: '소녀시대' },
          { title: 'I AM', artist: 'IVE', nativeArtist: '아이브' },
          { title: 'EASY', artist: 'LE SSERAFIM', nativeArtist: '르세라핌' },
        ],
      },
      {
        id: 'kpop-solo',
        name: 'Solo Artists',
        emoji: '🌟',
        songs: [
          { title: 'Gangnam Style', artist: 'PSY', nativeTitle: '강남스타일', nativeArtist: '싸이' },
          { title: 'ZOOM', artist: 'Jungkook', nativeArtist: '정국' },
          { title: 'Seven', artist: 'Jungkook', nativeArtist: '정국' },
          { title: 'Standing Next to You', artist: 'Jungkook', nativeArtist: '정국' },
          { title: 'LALISA', artist: 'Lisa', nativeArtist: '리사' },
          { title: 'Solo', artist: 'Jennie', nativeArtist: '제니' },
          { title: 'On the Ground', artist: 'Rose', nativeArtist: '로제' },
          { title: 'APT.', artist: 'Rose & Bruno Mars', nativeArtist: '로제 & Bruno Mars' },
          { title: 'Lilac', artist: 'IU', nativeTitle: '라일락', nativeArtist: '아이유' },
          { title: 'Celebrity', artist: 'IU', nativeArtist: '아이유' },
          { title: 'Good Day', artist: 'IU', nativeTitle: '좋은 날', nativeArtist: '아이유' },
          { title: 'Eyes, Nose, Lips', artist: 'Taeyang', nativeTitle: '눈, 코, 입', nativeArtist: '태양' },
          { title: 'Crooked', artist: 'G-Dragon', nativeTitle: '삐딱하게', nativeArtist: '지드래곤' },
          { title: 'Love Lee', artist: 'AKMU', nativeArtist: '악뮤' },
          { title: 'Way Back Home', artist: 'SHAUN', nativeArtist: '숀' },
          { title: 'Gentleman', artist: 'PSY', nativeArtist: '싸이' },
          { title: 'Maria', artist: 'Hwasa', nativeTitle: '마리아', nativeArtist: '화사' },
          { title: 'Eight', artist: 'IU & Suga', nativeTitle: '에잇', nativeArtist: '아이유 & 슈가' },
          { title: 'Permission to Dance', artist: 'BTS', nativeArtist: '방탄소년단' },
          { title: 'Yet To Come', artist: 'BTS', nativeArtist: '방탄소년단' },
        ],
      },
    ],
  },

  // ───────────────────────────────────────────
  // JAPANESE
  // ───────────────────────────────────────────
  {
    id: 'japanese',
    label: '🇯🇵 Japanese',
    categories: [
      {
        id: 'jp-anime',
        name: 'Anime Openings',
        emoji: '⚔️',
        songs: [
          { title: 'Cruel Angel\'s Thesis', artist: 'Neon Genesis Evangelion', nativeTitle: '残酷な天使のテーゼ', nativeArtist: '新世紀エヴァンゲリオン' },
          { title: 'Gurenge', artist: 'LiSA', nativeTitle: '紅蓮華' },
          { title: 'Unravel', artist: 'TK from Ling Tosite Sigure', nativeArtist: 'TK from 凛として時雨' },
          { title: 'Shinzou wo Sasageyo!', artist: 'Attack on Titan', nativeTitle: '心臓を捧げよ！', nativeArtist: '進撃の巨人' },
          { title: 'Renai Circulation', artist: 'Kana Hanazawa', nativeTitle: '恋愛サーキュレーション', nativeArtist: '花澤香菜' },
          { title: 'IDOL', artist: 'YOASOBI', nativeTitle: 'アイドル' },
          { title: 'Guren no Yumiya', artist: 'Attack on Titan', nativeTitle: '紅蓮の弓矢', nativeArtist: '進撃の巨人' },
          { title: 'Blue Bird', artist: 'Naruto Shippuden', nativeTitle: 'ブルーバード', nativeArtist: 'NARUTO -ナルト- 疾風伝' },
          { title: 'Silhouette', artist: 'Naruto Shippuden', nativeTitle: 'シルエット', nativeArtist: 'NARUTO -ナルト- 疾風伝' },
          { title: 'GO!!!', artist: 'Naruto', nativeArtist: 'NARUTO -ナルト-' },
          { title: 'Again', artist: 'Fullmetal Alchemist', nativeArtist: '鋼の錬金術師' },
          { title: 'Colors', artist: 'Code Geass', nativeArtist: 'コードギアス' },
          { title: 'The WORLD', artist: 'Death Note', nativeArtist: 'デスノート' },
          { title: 'Tank!', artist: 'Cowboy Bebop', nativeArtist: 'カウボーイビバップ' },
          { title: 'We Are!', artist: 'One Piece', nativeTitle: 'ウィーアー！' },
          { title: 'Cha-La Head-Cha-La', artist: 'Dragon Ball Z', nativeArtist: 'ドラゴンボールZ' },
          { title: 'A Cruel Angel\'s Thesis', artist: 'Evangelion', nativeTitle: '残酷な天使のテーゼ', nativeArtist: 'エヴァンゲリオン' },
          { title: 'My War', artist: 'Attack on Titan', nativeTitle: '僕の戦争', nativeArtist: '進撃の巨人' },
          { title: 'Kaikai Kitan', artist: 'Jujutsu Kaisen', nativeTitle: '廻廻奇譚', nativeArtist: '呪術廻戦' },
          { title: 'Specialz', artist: 'Jujutsu Kaisen', nativeArtist: '呪術廻戦' },
        ],
      },
      {
        id: 'jp-pop',
        name: 'J-Pop',
        emoji: '🌸',
        songs: [
          { title: 'Sukiyaki (Ue o Muite Arukou)', artist: 'Kyu Sakamoto', nativeTitle: '上を向いて歩こう', nativeArtist: '坂本九' },
          { title: 'First Love', artist: 'Hikaru Utada', nativeArtist: '宇多田ヒカル' },
          { title: 'Lemon', artist: 'Kenshi Yonezu', nativeArtist: '米津玄師' },
          { title: 'Pretender', artist: 'Official HIGE DANdism', nativeArtist: 'Official髭男dism' },
          { title: 'I Love You', artist: 'Ozaki Yutaka', nativeArtist: '尾崎豊' },
          { title: 'Marigold', artist: 'Aimyon', nativeTitle: 'マリーゴールド', nativeArtist: 'あいみょん' },
          { title: 'Harunohi', artist: 'Aimyon', nativeTitle: 'ハルノヒ', nativeArtist: 'あいみょん' },
          { title: 'Dry Flower', artist: 'Yuuri', nativeTitle: 'ドライフラワー', nativeArtist: '優里' },
          { title: 'Hana', artist: 'Mr. Children', nativeTitle: '花 -Mémento-Mori-' },
          { title: 'Tomorrow Never Knows', artist: 'Mr. Children' },
          { title: 'Hikari', artist: 'Hikaru Utada', nativeTitle: '光', nativeArtist: '宇多田ヒカル' },
          { title: 'Automatic', artist: 'Hikaru Utada', nativeArtist: '宇多田ヒカル' },
          { title: 'Shunkan Sentimental', artist: 'SCANDAL', nativeTitle: '瞬間センチメンタル' },
          { title: 'Love Story', artist: 'Matt Cab' },
          { title: 'Red', artist: 'Kalafina' },
          { title: 'Orion', artist: 'Kenshi Yonezu', nativeArtist: '米津玄師' },
          { title: 'Peace Sign', artist: 'Kenshi Yonezu', nativeTitle: 'ピースサイン', nativeArtist: '米津玄師' },
          { title: 'Butter-Fly', artist: 'Koji Wada', nativeArtist: '和田光司' },
          { title: 'Koi', artist: 'Gen Hoshino', nativeTitle: '恋', nativeArtist: '星野源' },
          { title: 'SUN', artist: 'Gen Hoshino', nativeArtist: '星野源' },
        ],
      },
      {
        id: 'jp-classic',
        name: 'City Pop & Classics',
        emoji: '🌃',
        songs: [
          { title: 'Plastic Love', artist: 'Mariya Takeuchi', nativeTitle: 'プラスティック・ラブ', nativeArtist: '竹内まりや' },
          { title: 'Stay with Me', artist: 'Miki Matsubara', nativeTitle: '真夜中のドア〜Stay With Me〜', nativeArtist: '松原みき' },
          { title: 'Magic Ways', artist: 'Tatsuro Yamashita', nativeArtist: '山下達郎' },
          { title: 'Ride on Time', artist: 'Tatsuro Yamashita', nativeArtist: '山下達郎' },
          { title: 'September', artist: 'Taeko Ohnuki', nativeArtist: '大貫妙子' },
          { title: 'Fantasy', artist: 'Meiko Nakahara', nativeTitle: 'ファンタジー', nativeArtist: '中原めいこ' },
          { title: 'Christmas Eve', artist: 'Tatsuro Yamashita', nativeTitle: 'クリスマス・イブ', nativeArtist: '山下達郎' },
          { title: 'Dress Down', artist: 'Kaoru Akimoto', nativeArtist: '秋元薫' },
          { title: 'Remember Summer Days', artist: 'Anri', nativeArtist: '杏里' },
          { title: 'Midnight Pretenders', artist: 'Tomoko Aran', nativeArtist: '亜蘭知子' },
          { title: 'Bay City', artist: 'Junko Yagami', nativeArtist: '八神純子' },
          { title: 'Sparkle', artist: 'Tatsuro Yamashita', nativeArtist: '山下達郎' },
          { title: 'Futari no Natsu Monogatari', artist: 'Sugiyama Kiyotaka', nativeTitle: 'ふたりの夏物語', nativeArtist: '杉山清貴' },
          { title: 'Mayonaka no Door', artist: 'Miki Matsubara', nativeTitle: '真夜中のドア', nativeArtist: '松原みき' },
          { title: 'Telephone Number', artist: 'Junko Ohashi', nativeTitle: 'テレフォン・ナンバー', nativeArtist: '大橋純子' },
          { title: '4:00 AM', artist: 'Taeko Ohnuki', nativeArtist: '大貫妙子' },
          { title: 'Windy Summer', artist: 'Anri', nativeArtist: '杏里' },
          { title: 'Cat\'s Eye', artist: 'Anri', nativeArtist: '杏里' },
          { title: 'Last Summer Whisper', artist: 'Anri', nativeArtist: '杏里' },
          { title: 'Loveland, Island', artist: 'Tatsuro Yamashita', nativeArtist: '山下達郎' },
        ],
      },
    ],
  },
];

/** Flat list of all categories across all sections. */
export const ALL_CATEGORIES: SongCategory[] = SONG_SECTIONS.flatMap(
  (s) => s.categories
);

/** Return a random song from across the given categories (default: all). */
export function getRandomSuggestion(
  categories: SongCategory[] = ALL_CATEGORIES
): SongSuggestion & { category: string } {
  const all = categories.flatMap((cat) =>
    cat.songs.map((song) => ({ ...song, category: cat.name }))
  );
  return all[Math.floor(Math.random() * all.length)];
}

/**
 * Build a YouTube-ready search query for a song suggestion. Prefers the
 * native-script fields — karaoke videos in JP/KR/HI are mostly indexed under
 * the native title, so they surface far better results than romanizations.
 */
export function buildSongQuery(song: SongSuggestion): string {
  const title = song.nativeTitle ?? song.title;
  const artist = song.nativeArtist ?? song.artist;
  return `${artist} ${title}`.trim();
}

/** Display title: native script first, romanization in parentheses. */
export function displaySongTitle(song: SongSuggestion): string {
  return song.nativeTitle ? `${song.nativeTitle} (${song.title})` : song.title;
}

/** Display artist: native script first, romanization in parentheses. */
export function displaySongArtist(song: SongSuggestion): string {
  return song.nativeArtist ? `${song.nativeArtist} (${song.artist})` : song.artist;
}

// ───────────────────────────────────────────
// COUNTRY-AWARE ORDERING
// ───────────────────────────────────────────

export interface CountryConfig {
  /**
   * Section ids in display order; the first becomes the default tab. Ids not
   * listed keep their original relative order after the listed ones.
   */
  sectionOrder: string[];
  /**
   * Id of a regional pack served from /public/suggestions/{id}.json. The pack
   * is a full SongSection, spliced in as the first tab when it loads.
   */
  regionalPack?: string;
}

const DEFAULT_ORDER = ['genre', 'voice-type', 'spanish', 'kpop', 'japanese'];

const SPANISH_FIRST: CountryConfig = {
  sectionOrder: ['spanish', 'genre', 'voice-type', 'kpop', 'japanese'],
};

export const COUNTRY_CONFIG: Record<string, CountryConfig> = {
  // Spanish-speaking Americas + Spain
  MX: SPANISH_FIRST, ES: SPANISH_FIRST, AR: SPANISH_FIRST, CO: SPANISH_FIRST,
  CL: SPANISH_FIRST, PE: SPANISH_FIRST, VE: SPANISH_FIRST, EC: SPANISH_FIRST,
  GT: SPANISH_FIRST, CU: SPANISH_FIRST, BO: SPANISH_FIRST, DO: SPANISH_FIRST,
  HN: SPANISH_FIRST, PY: SPANISH_FIRST, SV: SPANISH_FIRST, NI: SPANISH_FIRST,
  CR: SPANISH_FIRST, PA: SPANISH_FIRST, UY: SPANISH_FIRST, PR: SPANISH_FIRST,
  KR: { sectionOrder: ['kpop', 'genre', 'voice-type', 'spanish', 'japanese'] },
  JP: { sectionOrder: ['japanese', 'genre', 'voice-type', 'spanish', 'kpop'] },
  BR: { sectionOrder: DEFAULT_ORDER, regionalPack: 'br' },
  PT: { sectionOrder: DEFAULT_ORDER, regionalPack: 'br' },
  PH: { sectionOrder: DEFAULT_ORDER, regionalPack: 'ph' },
  DE: { sectionOrder: DEFAULT_ORDER, regionalPack: 'de' },
  AT: { sectionOrder: DEFAULT_ORDER, regionalPack: 'de' },
  CH: { sectionOrder: DEFAULT_ORDER, regionalPack: 'de' },
  IN: { sectionOrder: DEFAULT_ORDER, regionalPack: 'in' },
  ID: { sectionOrder: DEFAULT_ORDER, regionalPack: 'id' },
  MY: { sectionOrder: DEFAULT_ORDER, regionalPack: 'id' },
  CZ: { sectionOrder: DEFAULT_ORDER, regionalPack: 'cz' },
  SK: { sectionOrder: DEFAULT_ORDER, regionalPack: 'cz' },
  FR: { sectionOrder: DEFAULT_ORDER, regionalPack: 'fr' },
  BE: { sectionOrder: DEFAULT_ORDER, regionalPack: 'fr' },
};

/**
 * All regional/language packs, shown to every visitor under the Language tab
 * (lazy-loaded when the tab opens). Geo only decides which one, if any, is
 * promoted to its own first tab.
 */
export const LANGUAGE_PACKS: { packId: string; label: string }[] = [
  { packId: 'br', label: '🇧🇷 Brasil' },
  { packId: 'ph', label: '🇵🇭 OPM' },
  { packId: 'de', label: '🇩🇪 Deutsch' },
  { packId: 'in', label: '🇮🇳 Bollywood' },
  { packId: 'id', label: '🇮🇩 Indonesia' },
  { packId: 'cz', label: '🇨🇿 Česky' },
  { packId: 'fr', label: '🇫🇷 Français' },
];

/**
 * Order sections for a country: listed ids first (in config order), then any
 * unlisted sections in their original order. Unknown country → unchanged.
 */
export function orderSections(
  sections: SongSection[],
  country: string | null
): SongSection[] {
  const config = country ? COUNTRY_CONFIG[country] : undefined;
  if (!config) return sections;
  const rank = new Map(config.sectionOrder.map((id, i) => [id, i]));
  return [...sections].sort((a, b) => {
    const ra = rank.get(a.id) ?? config.sectionOrder.length + sections.indexOf(a);
    const rb = rank.get(b.id) ?? config.sectionOrder.length + sections.indexOf(b);
    return ra - rb;
  });
}
