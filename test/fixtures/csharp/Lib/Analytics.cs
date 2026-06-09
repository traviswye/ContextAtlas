namespace CsharpProbe.Lib;

/// <summary>Plain analytics utility — no service abstraction.</summary>
public static class Analytics
{
    /// <summary>Tracks an event by name.</summary>
    /// <param name="eventName">The event identifier.</param>
    public static void Track(string eventName)
    {
        // placeholder for spike fixture
    }

    /// <summary>Tracks a user-scoped event.</summary>
    public static void TrackForUser(int userId, string eventName)
    {
        Track(eventName);
    }
}
