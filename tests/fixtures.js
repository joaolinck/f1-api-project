export const Driver = {
  driverId: "senna",
  givenName: "Ayrton",
  familyName: "Senna",
  nationality: "Brazilian",
  dateOfBirth: "1960-03-21",
  url: "https://example.com/senna",
};
export const Constructor = {
  constructorId: "mclaren",
  name: "McLaren",
  nationality: "British",
  url: "https://example.com/mclaren",
};
export const Race = {
  season: "1991",
  round: "1",
  raceName: "Brazilian Grand Prix",
  date: "1991-03-24",
  Circuit: {
    circuitId: "interlagos",
    circuitName: "Interlagos",
    Location: { locality: "São Paulo", country: "Brazil" },
  },
};
export const Result = {
  position: "1",
  positionText: "1",
  grid: "1",
  laps: "71",
  points: "10",
  status: "Finished",
  Driver,
  Constructor,
  Time: { time: "1:38:00" },
};
export function fixtureFetch(url) {
  const path = new URL(url).pathname;
  let table,
    total = 1;
  if (
    path.includes("/drivers/") &&
    !path.includes("standings") &&
    !path.includes("/results/")
  )
    table = {
      DriverTable: {
        season: "1991",
        Drivers: path.includes("/missing/") ? [] : [Driver],
      },
    };
  else if (path.includes("/constructorstandings/"))
    table = {
      StandingsTable: {
        StandingsLists: [
          {
            season: "1991",
            round: "1",
            ConstructorStandings: [
              { position: "1", points: "10", wins: "1", Constructor },
            ],
          },
        ],
      },
    };
  else if (path.includes("/driverstandings/"))
    table = {
      StandingsTable: {
        StandingsLists: [
          {
            season: "1991",
            round: "1",
            DriverStandings: [
              {
                position: "1",
                points: "10",
                wins: "1",
                Driver,
                Constructors: [Constructor],
              },
            ],
          },
        ],
      },
    };
  else if (path.includes("/constructors/"))
    table = {
      ConstructorTable: { season: "1991", Constructors: [Constructor] },
    };
  else
    table = {
      RaceTable: {
        season: "1991",
        Races: [
          {
            ...Race,
            ...(path.includes("/results/") ? { Results: [Result] } : {}),
          },
        ],
      },
    };
  if (path.includes("/missing/")) total = 0;
  return Promise.resolve(
    Response.json({ MRData: { total: String(total), ...table } }),
  );
}
