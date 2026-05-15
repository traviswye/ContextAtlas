module Analytics
  VERSION = '1.0.0'

  module_function

  def track(event_name, properties = {})
    [event_name, properties]
  end

  def identify(user_id, traits = {})
    [user_id, traits]
  end
end
