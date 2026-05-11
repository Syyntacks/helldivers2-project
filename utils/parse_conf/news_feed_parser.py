import re
from conf import settings
from utils.parse_conf.planet_data_parser import PlanetParser
from utils.parse_conf.datetime_converter import format_dispatch_date

NEWS_FEED_URL: str = settings.urls.get("news_feed")

class newsFeedParser():

    def __init__(self, planet_parser: PlanetParser, user_timezone="UTC"):
        self.planet_parser = planet_parser
        self.user_timezone = user_timezone

    @staticmethod
    def _format_message(msg: str) -> str | None:
        """
        Converts in-game dispatch markup to HTML spans.
          <i=3>TEXT</i>  →  header style  (category label, e.g. "NEW MAJOR ORDER")
          <i=1>TEXT</i>  →  highlight style  (planet names, key terms)
        Returns None for empty or placeholder messages.
        """
        if not msg or msg.strip().lower() == "void msg":
            return None

        # <i=3> → dispatch-header span  (closing tag may be </i> or </I>)
        msg = re.sub(
            r'<i=3>(.*?)</[iI]>',
            r'<span class="dispatch-header">\1</span>',
            msg,
            flags=re.DOTALL
        )
        # <i=1> → dispatch-highlight span
        msg = re.sub(
            r'<i=1>(.*?)</[iI]>',
            r'<span class="dispatch-highlight">\1</span>',
            msg,
            flags=re.DOTALL
        )

        msg = msg.replace('\n', '<br>')
        return msg.strip()

    def parse_dispatch_data(self, data: list) -> list | None:
        if not isinstance(data, list):
            print(f"Error: Expected a list of dispatches, but received {type(data)}")
            return None

        parsed = []
        try:
            for dispatch in data:
                dispatch_id = dispatch.get("id")
                published_date = dispatch.get("published")
                dispatch_type = dispatch.get("type")
                raw_msg = dispatch.get("message", "")

                pub_dates = format_dispatch_date(published_date)
                published_short = pub_dates["short"]
                published_full = pub_dates["full"]

                formatted_msg = self._format_message(raw_msg)
                if formatted_msg is None:
                    continue

                parsed.append({
                    "id": dispatch_id,
                    "published_short": published_short,
                    "published_full": published_full,
                    "type": dispatch_type,
                    "message": formatted_msg,
                })

        except (AttributeError, TypeError, KeyError) as e:
            import traceback
            traceback.print_exc()
            print(f"Error processing dispatch data: {e}")
            return None

        print(f"Successfully parsed {len(parsed)} dispatches.")
        return parsed
